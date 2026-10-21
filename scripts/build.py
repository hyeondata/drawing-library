"""Prepare the local Sample assets for the Astro static build."""
import json
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / 'Sample'
if not (SOURCE / '02.라벨링데이터').is_dir():
    raise SystemExit('원본 Sample 폴더가 없습니다. 일반 빌드는 npm run build를 사용하세요.')
OUT = ROOT / 'public'
OUT.mkdir(exist_ok=True)
for sub in ('images', 'thumbs', 'labels'):
    (OUT / sub).mkdir(exist_ok=True)
for name in ('_headers', 'favicon.svg'):
    shutil.copy2(ROOT / 'src' / name, OUT / name)
records = []
for label in sorted((SOURCE / '02.라벨링데이터').glob('*/*.json')):
    data = json.loads(label.read_text(encoding='utf-8-sig'))
    name, kind = label.stem, label.parent.name
    image_meta = data['images'][0]
    image = SOURCE / '01.원천데이터' / kind / image_meta['file_name']
    if not image.exists():
        image = next((SOURCE / '01.원천데이터' / kind).glob(name + '.*'), None)
    record = dict(id=name, kind=kind, number=name.rsplit('_', 1)[-1],
                  width=image_meta['width'], height=image_meta['height'],
                  label=f'labels/{name}.json', image=None, thumbnail=None,
                  categories=data['categories'], annotations=data['annotations'])
    shutil.copy2(label, OUT / record['label'])
    if image:
        record['image'] = f'images/{name}.webp'
        record['thumbnail'] = f'thumbs/{name}.webp'
        existing = ROOT / 'dist'
        for key in ('image', 'thumbnail'):
            if not (OUT / record[key]).exists() and (existing / record[key]).is_file():
                shutil.copy2(existing / record[key], OUT / record[key])
        if any(not (OUT / record[key]).exists() or (OUT / record[key]).stat().st_mtime < image.stat().st_mtime for key in ('image','thumbnail')):
            with Image.open(image) as im:
                im.save(OUT / record['image'], 'WEBP', lossless=True, method=6)
                im.thumbnail((480, 340))
                im.save(OUT / record['thumbnail'], 'WEBP', quality=88, method=6)
    records.append(record)
(OUT / 'catalog.json').write_text(json.dumps(records, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(f'Built {len(records)} labels, {sum(bool(r["image"]) for r in records)} drawings in {OUT}')
