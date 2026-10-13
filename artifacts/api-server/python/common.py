"""Shared, local document primitives. No user document leaves the worker."""
import base64
import html
import io
import re
import subprocess
import zipfile
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageOps

MAX_PAGES = 1000
MAX_OUTPUT = 80 * 1024 * 1024
MIME = {
    ".pdf": "application/pdf", ".zip": "application/zip", ".txt": "text/plain",
    ".md": "text/markdown",
    ".html": "text/html", ".json": "application/json", ".csv": "text/csv",
    ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
    ".bmp": "image/bmp", ".tiff": "image/tiff", ".svg": "image/svg+xml",
    ".epub": "application/epub+zip", ".odt": "application/vnd.oasis.opendocument.text",
    ".rtf": "application/rtf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def number(options, key, default, minimum, maximum, integer=False):
    try:
        value = float(options.get(key) or default)
        if not minimum <= value <= maximum or (integer and int(value) != value):
            raise ValueError()
        return int(value) if integer else value
    except (ValueError, TypeError, OverflowError):
        raise ValueError(f"{key} must be {'an integer' if integer else 'a number'} from {minimum} to {maximum}.")


def open_pdf(path, password=""):
    doc = fitz.open(path)
    if not doc.is_pdf:
        doc.close()
        raise ValueError("Please upload an actual PDF document.")
    if doc.needs_pass and not doc.authenticate(password):
        doc.close()
        raise ValueError("This PDF needs the correct opening password. Enter the password and retry.")
    if not 1 <= len(doc) <= MAX_PAGES:
        doc.close()
        raise ValueError(f"Documents must have between 1 and {MAX_PAGES} pages.")
    return doc


def page_list(value, count, allow_duplicates=False, required=False):
    if not value.strip():
        if required:
            raise ValueError("Enter the page numbers or ranges to process.")
        return list(range(count))
    selected = []
    for part in value.split(","):
        match = re.fullmatch(r"\s*(\d+)(?:\s*-\s*(\d+))?\s*", part)
        if not match:
            raise ValueError("Use page numbers and ranges such as 1,3-5.")
        start, end = int(match[1]), int(match[2] or match[1])
        if not 1 <= start <= count or not 1 <= end <= count:
            raise ValueError(f"Page numbers must be from 1 to {count}.")
        sequence = range(start - 1, end, 1) if end >= start else range(start - 1, end - 2, -1)
        selected.extend(sequence)
        if len(selected) > MAX_PAGES:
            raise ValueError(f"The output cannot exceed {MAX_PAGES} pages.")
    return selected if allow_duplicates else list(dict.fromkeys(selected))


def output(name, data):
    if not data or len(data) > MAX_OUTPUT:
        raise ValueError("Output is empty or exceeds the 80 MB output limit. Try fewer pages.")
    return {"name": name, "mimeType": MIME.get(Path(name).suffix, "application/octet-stream"),
            "dataBase64": base64.b64encode(data).decode(), "bytes": len(data)}


def saved(doc):
    return doc.tobytes(garbage=4, deflate=True, clean=False)


def zip_outputs(files):
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w", zipfile.ZIP_DEFLATED) as z:
        for name, data in files:
            z.writestr(name, data)
    return memory.getvalue()


def run(command, timeout=120, cwd=None):
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, timeout=timeout, check=False)
    except FileNotFoundError:
        raise RuntimeError("The required local conversion engine is not installed.")
    except subprocess.TimeoutExpired:
        raise ValueError("This document took too long to process. Try a smaller file or fewer pages.")
    if result.returncode:
        raise ValueError("The local engine could not convert this file. Check that it is a valid, supported document.")
    return result


def html_pdf(markup, css=""):
    destination = io.BytesIO()
    writer = fitz.DocumentWriter(destination)
    story = fitz.Story(markup, user_css="body { font-family: sans-serif; font-size: 11pt; } " + css)
    rectangle = fitz.paper_rect("A4")
    content = rectangle + (42, 42, -42, -42)
    more = True
    count = 0
    while more:
        count += 1
        if count > MAX_PAGES:
            raise ValueError("The rendered content exceeds the page limit.")
        device = writer.begin_page(rectangle)
        more, _ = story.place(content)
        story.draw(device)
        writer.end_page()
    writer.close()
    return destination.getvalue(), count


def text_pdf(text, title):
    paras = "".join("<p>" + html.escape(p).replace("\n", "<br>") + "</p>" for p in text.split("\n\n"))
    return html_pdf(f"<h1>{html.escape(title)}</h1>{paras}")


def image_pdf(paths, options):
    doc = fitz.open()
    size = options.get("size", "A4")
    if size not in {"A4", "Letter", "Original"}:
        raise ValueError("Choose A4, Letter or Original page size.")
    orientation = options.get("orientation", "portrait")
    if orientation not in {"portrait", "landscape"}:
        raise ValueError("Choose portrait or landscape.")
    margin = number(options, "margin", 24, 0, 150)
    for path in paths:
        with Image.open(path) as source:
            source.seek(0)
            image = ImageOps.exif_transpose(source).convert("RGB")
            image.thumbnail((5000, 5000))
            buffer = io.BytesIO()
            image.save(buffer, format="JPEG", quality=95)
            width, height = image.size if size == "Original" else fitz.paper_size(size)
            if orientation == "landscape" and width < height:
                width, height = height, width
            if 2 * margin >= min(width, height):
                raise ValueError("The margin is too large for this image/page.")
            page = doc.new_page(width=width, height=height)
            page.insert_image(page.rect + (margin, margin, -margin, -margin), stream=buffer.getvalue())
    return doc


def selected_page(doc, options):
    index = number(options, "page", 1, 1, len(doc), integer=True) - 1
    page = doc[index]
    x = number(options, "x", 50, 0, page.rect.width - 1)
    y = number(options, "y", 100, 1, page.rect.height - 1)
    return page, x, y