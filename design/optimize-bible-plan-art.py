"""Optimize Bible-plan cover PNGs.

Downscales the 1440x810 exports to a size that still covers the largest card
render, then quantizes to an 8-bit palette. Keeps a lossless backup of the
originals so the change can be reverted.
"""
import argparse
import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "bible-plans"
BACKUP = ROOT / "design" / ".cover-originals"
OUT = ROOT / "design" / ".cover-optimized"


def optimize(src: Path, dst: Path, width: int, colors: int, dither: bool, keep_rgb: bool = False) -> tuple[int, int]:
    image = Image.open(src).convert("RGB")
    height = round(image.height * width / image.width)
    image = image.resize((width, height), Image.LANCZOS)
    if keep_rgb:
        image.save(dst, format="PNG", optimize=True, compress_level=9)
    else:
        base = image.quantize(colors=colors, method=Image.MEDIANCUT)
        quantized = image.quantize(palette=base, dither=Image.FLOYDSTEINBERG if dither else Image.Dither.NONE)
        quantized.save(dst, format="PNG", optimize=True, compress_level=9)
    return src.stat().st_size, dst.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--width", type=int, default=1080)
    parser.add_argument("--colors", type=int, default=256)
    parser.add_argument("--dither", action="store_true", default=True)
    parser.add_argument("--no-dither", dest="dither", action="store_false")
    parser.add_argument("--keep-rgb", action="store_true", help="resize only, keep 24-bit color")
    parser.add_argument("--apply", action="store_true", help="replace the committed covers")
    parser.add_argument("--only", default="", help="comma-separated cover keys")
    args = parser.parse_args()

    files = sorted(ASSETS.glob("*.png"))
    if args.only:
        wanted = set(args.only.split(","))
        files = [f for f in files if f.stem in wanted]
    if not files:
        raise SystemExit("no covers found")

    OUT.mkdir(parents=True, exist_ok=True)
    if args.apply:
        BACKUP.mkdir(parents=True, exist_ok=True)
        for f in files:
            backup = BACKUP / f.name
            if not backup.exists():
                shutil.copy2(f, backup)

    before = after = 0
    rows = []
    for src in files:
        dst = OUT / src.name
        b, a = optimize(src, dst, args.width, args.colors, args.dither, args.keep_rgb)
        before += b
        after += a
        rows.append((src.stem, b, a))
        if args.apply:
            shutil.copy2(dst, src)

    for name, b, a in rows:
        print(f"{name:24s} {b / 1024:7.1f} KB -> {a / 1024:6.1f} KB  ({a / b * 100:4.0f}%)")
    print(f"{'TOTAL':24s} {before / 1024 / 1024:7.2f} MB -> {after / 1024 / 1024:5.2f} MB  ({after / before * 100:4.0f}%)")
    if args.apply:
        print(f"backups in {BACKUP.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
