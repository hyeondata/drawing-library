"""../Sample(AI 허브 샘플)에서 화면용 데이터를 만든다.

- 라벨: SPA·STR·OBJ JSON을 public/data/labels/에 공백 없이 복사한다(OCR은 평가 대상이 아니라 제외).
- 이미지: 원천 PNG를 화면용 WebP(긴 변 2000px)와 썸네일(긴 변 360px)로 만든다.

사용: python3 scripts/prepare_data.py [Sample 경로]
필요: Python 3, Pillow
"""

import json
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "Sample"
KINDS = ("SPA", "STR", "OBJ")


def main() -> None:
    labels_dir = SAMPLE / "02.라벨링데이터"
    images_dir = SAMPLE / "01.원천데이터"
    if not labels_dir.is_dir():
        sys.exit(f"Sample 폴더를 찾을 수 없습니다: {SAMPLE}")

    out_labels = ROOT / "public" / "data" / "labels"
    out_images = ROOT / "public" / "images"
    out_thumbs = ROOT / "public" / "thumbs"
    for d in (out_labels, out_images, out_thumbs):
        d.mkdir(parents=True, exist_ok=True)
        for old in d.iterdir():
            old.unlink()

    n_labels = 0
    for kind in KINDS:
        for src in sorted((labels_dir / kind).glob("*.json")):
            data = json.loads(src.read_text(encoding="utf-8"))
            (out_labels / src.name).write_text(
                json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
            )
            n_labels += 1

    n_images = 0
    for kind in KINDS:
        for src in sorted((images_dir / kind).glob("*.PNG")) + sorted((images_dir / kind).glob("*.png")):
            with Image.open(src) as im:
                im = im.convert("RGB")
                full = im.copy()
                full.thumbnail((2000, 2000), Image.LANCZOS)
                full.save(out_images / f"{src.stem}.webp", "WEBP", quality=82, method=6)
                thumb = im.copy()
                thumb.thumbnail((360, 360), Image.LANCZOS)
                thumb.save(out_thumbs / f"{src.stem}.webp", "WEBP", quality=78, method=6)
            n_images += 1

    print(f"라벨 {n_labels}개, 이미지 {n_images}개를 준비했습니다.")


if __name__ == "__main__":
    main()
