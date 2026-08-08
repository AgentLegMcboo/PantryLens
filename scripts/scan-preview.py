#!/usr/bin/env python3
"""
Runs one photo through the real scan pipeline and writes out every stage.

This exists because the interesting failures are visual. A JSON blob saying
"Cheerios, box_2d [180, 240, 420, 520]" tells you nothing about whether that
rectangle is actually on the Cheerios — and box placement is the part of this
feature most likely to be wrong.

Each run leaves behind:

    01-resized.jpg    exactly what the model was sent, after downscaling
    02-response.json  the raw function response, unmodified
    03-boxes.jpg      those boxes drawn back onto the photo
    04-crops.jpg      a contact sheet of what each box actually contains

The contact sheet is the one that matters. If a crop shows the wrong product,
the box is wrong, however plausible the name beside it looks.

Usage:
    export SCAN_JWT="<a signed-in user's access token>"
    python3 scripts/scan-preview.py path/to/photo.jpg [outdir]

Credentials come from the environment, never from this file.
"""

import base64
import json
import os
import pathlib
import sys
import textwrap
import urllib.request

from PIL import Image, ImageDraw, ImageFont

# Must match lib/photo.ts, or the boxes are measured against a different image
# than the one on screen.
MAX_EDGE = 1280
JPEG_QUALITY = 55

PALETTE = [
    (231, 76, 60), (52, 152, 219), (46, 204, 113), (241, 196, 15),
    (155, 89, 182), (26, 188, 156), (230, 126, 34), (233, 30, 99),
    (96, 125, 139), (121, 85, 72),
]


def load_font(size):
    for pattern in ("DejaVuSans-Bold.ttf", "DejaVuSans.ttf"):
        for path in pathlib.Path("/usr/share/fonts").rglob(pattern):
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def resize_like_the_app(src_path, dest_path):
    img = Image.open(src_path).convert("RGB")
    w, h = img.size
    long_edge = max(w, h)
    if long_edge > MAX_EDGE:
        scale = MAX_EDGE / long_edge
        img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    img.save(dest_path, "JPEG", quality=JPEG_QUALITY)
    return img


def call_function(image_path):
    url = os.environ.get("EXPO_PUBLIC_SUPABASE_URL")
    anon = os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY")
    jwt = os.environ.get("SCAN_JWT")
    missing = [n for n, v in
               (("EXPO_PUBLIC_SUPABASE_URL", url),
                ("EXPO_PUBLIC_SUPABASE_ANON_KEY", anon),
                ("SCAN_JWT", jwt)) if not v]
    if missing:
        sys.exit(f"Missing environment: {', '.join(missing)}")

    payload = json.dumps({
        "images": [base64.b64encode(open(image_path, "rb").read()).decode()]
    }).encode()

    req = urllib.request.Request(
        f"{url}/functions/v1/analyze-donation",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "apikey": anon,
            "Authorization": f"Bearer {jwt}",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as err:
        # The function puts its reason in the body. Letting urllib raise bare
        # swallowed exactly the line worth reading.
        body = err.read().decode(errors="replace")
        try:
            return {"error": json.loads(body).get("error", body), "status": err.code}
        except json.JSONDecodeError:
            return {"error": f"HTTP {err.code}: {body[:400]}", "status": err.code}


def draw_boxes(img, items, dest_path):
    out = img.copy()
    d = ImageDraw.Draw(out, "RGBA")
    W, H = out.size
    font = load_font(max(12, W // 70))

    for i, item in enumerate(items):
        box = item.get("box_2d")
        if not box:
            continue
        ymin, xmin, ymax, xmax = box
        x0, y0 = xmin / 1000 * W, ymin / 1000 * H
        x1, y1 = xmax / 1000 * W, ymax / 1000 * H
        colour = PALETTE[i % len(PALETTE)]

        d.rectangle([x0, y0, x1, y1], outline=colour, width=3)
        label = f"{i+1}. {item['name'][:24]}"
        tw = d.textlength(label, font=font)
        # Tag above the box, or inside it when the box is against the top edge.
        ty = y0 - font.size - 6 if y0 > font.size + 8 else y0 + 2
        d.rectangle([x0, ty, x0 + tw + 8, ty + font.size + 5], fill=colour + (235,))
        d.text((x0 + 4, ty + 2), label, font=font, fill=(255, 255, 255))

    out.save(dest_path, "JPEG", quality=88)
    return out


def crop_sheet(img, items, dest_path, cols=4, cell=240):
    """What each box actually contains, side by side with what it was called."""
    boxed = [i for i in items if i.get("box_2d")]
    if not boxed:
        return None

    W, H = img.size
    rows = (len(boxed) + cols - 1) // cols
    caption_h = 46
    sheet = Image.new("RGB", (cols * cell, rows * (cell + caption_h)), (245, 241, 235))
    d = ImageDraw.Draw(sheet)
    font = load_font(13)

    for i, item in enumerate(boxed):
        ymin, xmin, ymax, xmax = item["box_2d"]
        x0, y0 = max(0, xmin / 1000 * W), max(0, ymin / 1000 * H)
        x1, y1 = min(W, xmax / 1000 * W), min(H, ymax / 1000 * H)
        if x1 - x0 < 2 or y1 - y0 < 2:
            continue

        crop = img.crop((int(x0), int(y0), int(x1), int(y1)))
        crop.thumbnail((cell - 10, cell - 10), Image.LANCZOS)

        cx = (i % cols) * cell
        cy = (i // cols) * (cell + caption_h)
        sheet.paste(crop, (cx + (cell - crop.width) // 2, cy + (cell - crop.height) // 2))

        colour = PALETTE[i % len(PALETTE)]
        d.rectangle([cx + 2, cy + 2, cx + cell - 2, cy + cell - 2], outline=colour, width=2)

        text = f"{i+1}. {item['count']}x {item['name']}"
        lines = textwrap.wrap(text, width=34)[:2]
        for li, line in enumerate(lines):
            d.text((cx + 6, cy + cell + 4 + li * 15), line, font=font, fill=(40, 36, 32))
        d.text((cx + 6, cy + cell + 4 + len(lines) * 15),
               f"{item['category']} · {int(item['confidence'] * 100)}%",
               font=font, fill=(110, 100, 90))

    sheet.save(dest_path, "JPEG", quality=88)
    return sheet


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)

    src = sys.argv[1]
    outdir = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "scan-preview-out")
    outdir.mkdir(parents=True, exist_ok=True)

    original = Image.open(src)
    resized_path = outdir / "01-resized.jpg"
    img = resize_like_the_app(src, resized_path)
    print(f"original {original.size[0]}x{original.size[1]} "
          f"({os.path.getsize(src)/1024:.0f}KB)")
    print(f"sent     {img.size[0]}x{img.size[1]} "
          f"({os.path.getsize(resized_path)/1024:.0f}KB)  -> {resized_path}")

    data = call_function(resized_path)
    (outdir / "02-response.json").write_text(json.dumps(data, indent=2))

    if "error" in data:
        sys.exit(f"function error: {data['error']}")

    items = data.get("items", [])
    print(f"\n{len(items)} item(s) detected\n")
    print(f"{'#':>2}  {'count':>5}  {'name':32} {'category':10} {'expires':11} {'conf':>4}  box")
    for i, item in enumerate(items, 1):
        box = item.get("box_2d")
        print(f"{i:>2}  {item['count']:>5}  {item['name'][:32]:32} "
              f"{item['category']:10} {str(item['expiration'] or '-'):11} "
              f"{item['confidence']:>4.2f}  {box if box else 'NO BOX'}")

    draw_boxes(img, items, outdir / "03-boxes.jpg")
    crop_sheet(img, items, outdir / "04-crops.jpg")

    no_box = sum(1 for i in items if not i.get("box_2d"))
    print(f"\nwithout a box: {no_box}")
    print(f"written to {outdir}/")


if __name__ == "__main__":
    main()
