const $ = id => document.getElementById(id);
const typeNames = {OBJ:'객체',SPA:'공간',STR:'구조',OCR:'문자'};
const colors = ['#397c6c','#be7a40','#6685bd','#ac6d98','#7a9649','#b39b47','#5c9399','#996b50'];
let records = [], current, selectedAnnotation = null;
let scale = 1, tx = 0, ty = 0, fitScale = 1;
let drag = null, dragMoved = false;
const color = id => colors[Math.abs(Number(id)) % colors.length];
const nameOf = a => current.categories.find(c => c.id === a.category_id)?.name.replaceAll('_',' · ') || '미분류';
const annotationText = a => a.attributes?.OCR || nameOf(a);
const visibleAnnotations = () => current.annotations.filter(a => $('category').value === 'all' || String(a.category_id) === $('category').value);

function transform() {
  if (!current) return;
  $('scene').style.width = current.width + 'px';
  $('scene').style.height = current.height + 'px';
  $('scene').style.transform = `translate(${tx - current.width * scale / 2}px,${ty - current.height * scale / 2}px) scale(${scale})`;
  $('zoomValue').value = `${Math.round(scale / fitScale * 100)}%`;
}
function fit() {
  if (!current) return;
  fitScale = Math.min(Math.max(100,$('viewer').clientWidth - 60) / current.width, Math.max(100,$('viewer').clientHeight - 130) / current.height);
  scale = fitScale; tx = 0; ty = 0; transform();
}
function zoom(factor, x = 0, y = 0) {
  if (!current?.image) return;
  const next = Math.max(fitScale * .5, Math.min(fitScale * 12, scale * factor));
  const ratio = next / scale;
  tx = x - (x - tx) * ratio; ty = y - (y - ty) * ratio;
  scale = next; transform();
}
function renderList() {
  const search = $('search').value.toLowerCase().trim();
  const filtered = records.filter(r => ($('kind').value === 'all' || r.kind === $('kind').value) && ($('availability').value === 'all' || r.image) && r.id.toLowerCase().includes(search));
  $('resultCount').textContent = `${filtered.length}개 도면`;
  const list = $('drawingList'); list.replaceChildren();
  filtered.forEach(r => {
    const button = document.createElement('button'); button.className = 'drawing-card' + (r === current ? ' active' : '');
    button.setAttribute('aria-pressed', String(r === current)); button.dataset.id = r.id;
    if (r.thumbnail) {
      const img = document.createElement('img'); img.src = r.thumbnail; img.alt = ''; img.loading = 'lazy'; img.className = 'thumb'; button.append(img);
    } else { const placeholder = document.createElement('span'); placeholder.className = 'thumb missing-thumb'; placeholder.textContent = '▧'; button.append(placeholder); }
    const copy = document.createElement('span'); copy.className = 'card-copy';
    const badge = document.createElement('span'); badge.className = 'type-badge'; badge.textContent = r.kind;
    const title = document.createElement('strong'); title.textContent = r.number;
    const subtitle = document.createElement('small'); subtitle.textContent = `${r.annotations.length}개 라벨 · ${r.image ? '이미지 있음' : '라벨만 있음'}`;
    copy.append(badge,title,subtitle);button.append(copy);button.addEventListener('click',() => select(r));list.append(button);
  });
  if (!filtered.length) { const message = document.createElement('p'); message.className = 'no-results'; message.textContent = '조건에 맞는 도면이 없어요. 표시 범위를 “라벨 포함 전체”로 바꾸거나 검색 조건을 변경해 주세요.';list.append(message); }
}
function filterChanged() {
  renderList();
  const first = $('drawingList').querySelector('button');
  if (first && !$('drawingList').querySelector('button.active')) select(records.find(r => r.id === first.dataset.id));
  else if (!first) $('selectionStatus').textContent = '검색 결과가 없어 이전에 선택한 도면을 표시하고 있어요.';
  else $('selectionStatus').textContent = current.image ? '도면과 대응하는 라벨을 함께 보고 있어요.' : '라벨 데이터만 있어요 · 원천 이미지 미포함';
}
function select(record) {
  current = record; selectedAnnotation = null;
  history.replaceState(null,'',`#${record.id}`);
  $('drawingKind').textContent = `${record.kind} / ${typeNames[record.kind]} 도면`;
  $('drawingTitle').textContent = record.id;
  $('drawingMeta').textContent = `${record.width.toLocaleString()} × ${record.height.toLocaleString()} px · ${record.annotations.length}개 라벨`;
  $('annotationCount').textContent = record.annotations.length;
  $('scene').hidden = !record.image; $('empty').hidden = Boolean(record.image); $('imageError').hidden = true;
  $('imageDownload').setAttribute('aria-disabled',String(!record.image));
  if (record.image) {
    $('drawing').alt = `${typeNames[record.kind]} 도면 ${record.number}`;
    $('drawing').onload = () => { if (current === record) $('imageError').hidden = true; };
    $('drawing').onerror = () => { if (current === record) $('imageError').hidden = false; };
    $('drawing').src = record.image;
    $('imageDownload').href = record.image; $('imageDownload').download = record.id + '.webp';
  } else { $('drawing').removeAttribute('src'); $('imageDownload').removeAttribute('href'); }
  $('labelDownload').href = record.label; $('labelDownload').download = record.id + '.json';
  $('showOverlay').disabled = !record.image;
  for (const id of ['zoomIn','zoomOut','fit']) $(id).disabled = !record.image;
  const category = $('category'); category.replaceChildren(new Option('전체 카테고리','all'));
  const used = record.categories.filter(c => record.annotations.some(a => a.category_id === c.id));
  used.forEach(c => category.add(new Option(c.name.replaceAll('_',' · '),String(c.id))));
  const legend = $('legend'); legend.replaceChildren();
  used.forEach(c => { const tag = document.createElement('span'); const dot = document.createElement('i'); dot.className = 'dot'; dot.style.background = color(c.id);tag.append(dot,document.createTextNode(c.name.split('_').pop()));legend.append(tag); });
  $('selectionStatus').textContent = record.image ? '도면과 대응하는 라벨을 함께 보고 있어요.' : '라벨 데이터만 있어요 · 원천 이미지 미포함';
  fit();renderList();renderAnnotations();
}
function renderAnnotations() {
  if (!current) return;
  const annotations = visibleAnnotations();
  const overlay = $('overlay'); overlay.replaceChildren();overlay.setAttribute('viewBox',`0 0 ${current.width} ${current.height}`);
  overlay.style.display = !$('showOverlay').checked || !current.image ? 'none' : '';
  const list = $('annotationList'); const scrollPosition = selectedAnnotation ? list.scrollTop : 0;list.replaceChildren();
  annotations.forEach((a,index) => {
    const group = document.createElementNS('http://www.w3.org/2000/svg','g');
    const polygons = a.segmentation?.filter(p => Array.isArray(p) && p.length >= 6) || [];
    const geometries = polygons.length ? polygons.map(p => ({type:'polygon',points:p.reduce((s,v,i)=>s+(i%2?',':' ')+v,'').trim()})) : [{type:'rect',x:a.bbox?.[0] || 0,y:a.bbox?.[1] || 0,width:a.bbox?.[2] || 0,height:a.bbox?.[3] || 0}];
    geometries.forEach(geometry => {
      const shape = document.createElementNS('http://www.w3.org/2000/svg',geometry.type);
      for (const [key,value] of Object.entries(geometry)) if (key !== 'type') shape.setAttribute(key,value);
      shape.setAttribute('fill',color(a.category_id));shape.setAttribute('fill-opacity','.12');shape.setAttribute('stroke',color(a.category_id));shape.setAttribute('stroke-width','1.5');shape.setAttribute('vector-effect','non-scaling-stroke');shape.classList.add('region');
      if (a === selectedAnnotation) shape.classList.add('selected');
      const title = document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent = annotationText(a);shape.append(title);
      shape.addEventListener('click',() => { if (!dragMoved) focusAnnotation(a); });group.append(shape);
    });overlay.append(group);
    const row = document.createElement('button');row.className = 'annotation-row' + (a === selectedAnnotation ? ' active' : '');row.setAttribute('aria-pressed',String(a === selectedAnnotation));
    const dot = document.createElement('i');dot.className = 'dot';dot.style.background = color(a.category_id);
    const text = document.createElement('span');text.textContent = annotationText(a);
    const num = document.createElement('small');num.textContent = '#' + String(a.id ?? index).padStart(2,'0');row.append(dot,text,num);row.addEventListener('click',() => focusAnnotation(a));list.append(row);
  });
  if (!annotations.length) { const p = document.createElement('p');p.className = 'no-results';p.textContent = '표시할 라벨이 없어요.';list.append(p); }
  list.scrollTop = scrollPosition;
}
function focusAnnotation(a) {
  selectedAnnotation = a;
  if (current.image && a.bbox) {
    const [x,y,w,h] = a.bbox;
    scale = Math.min(fitScale * 10, Math.max(fitScale,Math.min($('viewer').clientWidth / (w * 2.8), $('viewer').clientHeight / (h * 2.8))));
    tx = (current.width / 2 - x - w / 2) * scale; ty = (current.height / 2 - y - h / 2) * scale;transform();
  }
  $('selectionStatus').textContent = `${annotationText(a)} · 라벨 #${a.id} ${current.image ? '선택됨' : '· 원천 이미지 미포함'}`;
  renderAnnotations();
}
$('search').addEventListener('input',filterChanged);
$('kind').addEventListener('change',filterChanged);
$('availability').addEventListener('change',filterChanged);
$('category').addEventListener('change',() => { selectedAnnotation = null;renderAnnotations(); });
$('showOverlay').addEventListener('change',renderAnnotations);
$('zoomIn').addEventListener('click',() => zoom(1.3));
$('zoomOut').addEventListener('click',() => zoom(1 / 1.3));
$('fit').addEventListener('click',fit);
const viewer = $('viewer');
viewer.addEventListener('wheel',e => { if (current?.image) { e.preventDefault();const rect = viewer.getBoundingClientRect();zoom(Math.exp(-e.deltaY * .0015),e.clientX-rect.left-rect.width/2,e.clientY-rect.top-rect.height/2); } },{passive:false});
viewer.addEventListener('pointerdown',e => {
  if (!current?.image || e.target.closest('button,a,.zoom-controls') || e.button !== 0) return;
  drag = {x:e.clientX,y:e.clientY,tx,ty,id:e.pointerId};dragMoved = false;
});
viewer.addEventListener('pointermove',e => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x,dy = e.clientY - drag.y;
  if (Math.hypot(dx,dy) > 4) { dragMoved = true;viewer.classList.add('dragging');viewer.setPointerCapture(e.pointerId); }
  if (dragMoved) { tx = drag.tx + dx;ty = drag.ty + dy;transform(); }
});
function endDrag(e) { if (drag?.id !== e.pointerId) return;drag = null;viewer.classList.remove('dragging');if (viewer.hasPointerCapture(e.pointerId)) viewer.releasePointerCapture(e.pointerId); }
viewer.addEventListener('pointerup',endDrag);viewer.addEventListener('pointercancel',endDrag);
viewer.addEventListener('keydown',e => {
  if (e.target !== viewer || !current?.image) return;
  if (['+','=','-','0','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  if (e.key === '+' || e.key === '=') zoom(1.3);
  if (e.key === '-') zoom(1/1.3);
  if (e.key === '0') fit();
  if (e.key === 'ArrowLeft') tx += 40;
  if (e.key === 'ArrowRight') tx -= 40;
  if (e.key === 'ArrowUp') ty += 40;
  if (e.key === 'ArrowDown') ty -= 40;
  transform();
});
new ResizeObserver(() => { if (current) fit(); }).observe(viewer);
fetch('catalog.json').then(response => { if (!response.ok) throw Error('목록 불러오기 실패');return response.json(); }).then(data => {
  records = data;
  $('collectionCount').textContent = `원천 이미지 ${records.filter(r => r.image).length}개 · 라벨 ${records.length}개`;
  const requested = records.find(r => r.id === location.hash.slice(1));
  if (requested && !requested.image) $('availability').value = 'all';
  select(requested || records.find(r => r.image) || records[0]);
}).catch(error => { $('fatal').hidden = false;$('fatal').textContent = '데이터를 불러오지 못했어요. 서버 연결을 확인한 뒤 새로고침해 주세요. (' + error.message + ')'; });
