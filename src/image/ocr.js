// 브라우저 글자 인식(Tesseract.js, 한국어). 이미지는 밖으로 보내지 않는다. 인식 파일은 같은 사이트의 /ocr/에서 받는다.
// AI 허브 도면(가로 4963px)에서 실 이름 글자는 높이 약 17px이다. 샘플 12장을 원본의 100·80·60·50·40%로 읽어 보니
// 한 크기로는 놓치는 이름이 많아, 80·60·50%(가로 약 3970·2980·2480px) 세 번을 합쳤다.
// 다섯 크기를 모두 쓸 때 이름 192개, 이 조합은 178개를 찾고 시간은 약 60%다.

const SHEET_PASSES = [3970, 2980, 2480];
let workerPromise = null;

async function getWorker(base, onProgress) {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker, PSM } = await import('tesseract.js');
      const worker = await createWorker('kor', 1, {
        workerPath: `${base}ocr/worker.min.js`,
        corePath: `${base}ocr/`,
        langPath: `${base}ocr/`,
        workerBlobURL: false,
        logger: (m) => {
          if (m.status === 'loading language traineddata' || m.status === 'loading tesseract core') onProgress?.('글자 인식 준비 중…', m.progress);
          if (m.status === 'recognizing text') onProgress?.('글자 읽는 중…', m.progress);
        },
      });
      await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
      return worker;
    })();
    workerPromise.catch(() => (workerPromise = null));
  }
  return workerPromise;
}

/**
 * 원본 이미지에서 글자 줄을 읽는다.
 * img: 원본 HTMLImageElement, crop: 읽을 범위(원본 좌표 {x, y, w, h}), toProc: 원본 → 처리 해상도 배율.
 * 반환: [{ text, confidence, bbox: {x0, y0, x1, y1} }] (처리 해상도 좌표)
 */
export async function readText(img, crop, toProc, { base = '/', onProgress } = {}) {
  const worker = await getWorker(base, onProgress);
  const natW = img.naturalWidth;
  const widths = [...new Set(SHEET_PASSES.map((w) => Math.min(natW, w)))];
  const lines = [];
  for (const [i, sheetW] of widths.entries()) {
    const k = sheetW / natW;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(crop.w * k));
    c.height = Math.max(1, Math.round(crop.h * k));
    const cx = c.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, c.width, c.height);
    cx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, c.width, c.height);
    onProgress?.(`글자 읽는 중… (${i + 1}/${widths.length})`, 0);
    const { data } = await worker.recognize(c, {}, { blocks: true });
    for (const b of data.blocks || [])
      for (const p of b.paragraphs)
        for (const l of p.lines) {
          const map = (x, o) => (x / k + o) * toProc;
          lines.push({
            text: l.text,
            confidence: l.confidence,
            bbox: { x0: map(l.bbox.x0, crop.x), y0: map(l.bbox.y0, crop.y), x1: map(l.bbox.x1, crop.x), y1: map(l.bbox.y1, crop.y) },
          });
          // 한 줄에 실 이름 두 개가 붙어 읽히면("침실1 거실") 단어 단위로도 넣는다.
          if (l.words?.length > 1)
            for (const w of l.words)
              lines.push({ text: w.text, confidence: w.confidence, bbox: { x0: map(w.bbox.x0, crop.x), y0: map(w.bbox.y0, crop.y), x1: map(w.bbox.x1, crop.x), y1: map(w.bbox.y1, crop.y) } });
        }
  }
  return lines;
}
