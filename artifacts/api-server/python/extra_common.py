import html
import csv
import io
import json
import re
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageDraw
from common import output, number


def csv_data(rows):
    """Export PDF table cells without enabling spreadsheet formula injection."""
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer)
    for row in rows:
        writer.writerow([("'" + v if isinstance(v,str) and v[:1] in "=+-@" and
                          not re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?",v)
                          else v) for v in row])
    return buffer.getvalue().encode("utf-8-sig")


def finish(slug, paths, data, extension, count=0, text="", warnings=None, message="Your file is ready."):
    if extension == ".pdf":
        with fitz.open(stream=data, filetype="pdf") as doc:
            if not len(doc):
                raise RuntimeError("The generated PDF has no pages.")
            count = len(doc)
    file = output(slug + extension, data)
    return {"files": [file], "message": message, "warnings": warnings or [],
            "originalBytes": sum(p.stat().st_size for p in paths), "outputBytes": len(data),
            "pageCount": count, "text": text}


def json_bytes(value):
    return json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False).encode("utf-8")


def safe_name(value):
    return re.sub(r"[^\w.-]", "_", str(value).replace("\\", "/").split("/")[-1])[:100] or "file"


def load_image(path):
    with Image.open(path) as source:
        if source.width * source.height > 25_000_000:
            raise ValueError("Images are limited to 25 million pixels.")
        from PIL import ImageOps
        image = ImageOps.exif_transpose(source).convert("RGBA")
        image.info.clear()
        return image


def encode_image(image, extension="png", quality=90):
    buffer = io.BytesIO()
    if extension in {"jpg", "bmp"}:
        rgb = Image.new("RGB", image.size, "white")
        if image.mode == "RGBA":
            rgb.paste(image, mask=image.getchannel("A"))
        else:
            rgb.paste(image.convert("RGB"))
        image = rgb
    formats = {"png":"PNG","jpg":"JPEG","webp":"WEBP","bmp":"BMP","tiff":"TIFF"}
    kwargs = {"quality": quality} if extension in {"jpg", "webp"} else {"compression": "tiff_deflate"} if extension == "tiff" else {}
    image.save(buffer, format=formats[extension], **kwargs)
    return buffer.getvalue()


def contact_sheet(images, labels, options):
    columns = number(options, "columns", 4, 1, 8, integer=True)
    rows = (len(images)+columns-1)//columns
    if rows * 250 > 7500:
        raise ValueError("The contact sheet would be too tall. Use more columns or fewer pages.")
    sheet = Image.new("RGB", (columns*220, rows*250), "white")
    draw = ImageDraw.Draw(sheet)
    for i, (image, label) in enumerate(zip(images, labels)):
        thumb = image.copy()
        thumb.thumbnail((200, 215))
        x, y = (i%columns)*220, (i//columns)*250
        if thumb.mode == "RGBA":
            sheet.paste(thumb, (x+(220-thumb.width)//2, y+8), thumb)
        else:
            sheet.paste(thumb.convert("RGB"), (x+(220-thumb.width)//2, y+8))
        draw.text((x+10, y+230), label[:28], fill="black")
    return encode_image(sheet)


def html_document(content, title):
    return ('<!DOCTYPE html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
            f'<title>{html.escape(title)}</title><style>body{{max-width:850px;margin:40px auto;padding:0 20px;font:16px/1.6 sans-serif}}'
            'pre{white-space:pre-wrap;background:#f4f4f4;padding:14px}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}</style>'
            f'<body>{content}</body></html>')