"""Offline extractive summary, Markdown extraction, translation and actual comparison."""
import difflib
import html
import io
import math
import re
from collections import Counter
from pathlib import Path

import pymupdf as fitz
from PIL import Image, ImageChops, ImageOps

from common import number, text_pdf, zip_outputs


def extract(doc):
    text = "\n\n".join(p.get_text(sort=True).strip() for p in doc)
    if not text.strip():
        raise ValueError("This PDF has no extractable text. Run OCR first for scanned pages.")
    return text


def summarize(doc, options):
    text = extract(doc)
    if len(text) > 400_000:
        raise ValueError("Summary extraction is limited to 400,000 characters.")
    count = number(options, "sentences", 6, 1, 20, integer=True)
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n\n+", text) if len(s.strip()) > 20]
    if not sentences:
        sentences = [text.strip()]
    stop = set("the a an and or but is are was were be been being to of in on for from with by as at this that these those it its have has not we you they their our your will can may".split())
    tokenize = lambda s: [w for w in re.findall(r"\b[\w'-]+\b", s.lower()) if len(w) > 2 and w not in stop]
    document_frequency = Counter(w for s in sentences for w in set(tokenize(s)))
    scores = []
    for i, sentence in enumerate(sentences):
        words = tokenize(sentence)
        score = sum(math.log(1 + len(sentences) / (1 + document_frequency[w])) * document_frequency[w] for w in words)
        score /= math.sqrt(max(1, len(words)))
        # Light lead-sentence preference; output is always verbatim source text.
        scores.append((score * (1.15 if i < 3 else 1), i))
    chosen = sorted(i for _, i in sorted(scores, reverse=True)[:count])
    result = "\n\n".join(sentences[i] for i in chosen)
    return result


def markdown(doc):
    import pymupdf4llm
    extract(doc)
    result = pymupdf4llm.to_markdown(doc, show_progress=False, write_images=False, embed_images=False)
    if not result.strip():
        raise ValueError("No Markdown could be extracted from this document.")
    return result


def translate(doc, options):
    import ctranslate2
    import sentencepiece
    text = extract(doc)
    if len(text) > 20_000:
        raise ValueError("Offline translation is limited to 20,000 extracted characters per request.")
    target = options.get("language", "es")
    if target not in {"es", "fr", "hi"}:
        raise ValueError("Choose Spanish (es), French (fr) or Hindi (hi). Source language must be English.")
    model = Path(__file__).resolve().parents[1] / "models" / ("en-" + target)
    if not (model / "model/model.bin").is_file():
        raise RuntimeError("The selected offline language model is not installed.")
    tokenizer = sentencepiece.SentencePieceProcessor(model_file=str(model / "sentencepiece.model"))
    translator = ctranslate2.Translator(str(model / "model"), device="cpu", inter_threads=1, intra_threads=2)
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n|(?<=[.!?])\s+", text) if p.strip()]
    pieces = []
    for paragraph in paragraphs:
        # Bound inference memory even on pathological long lines.
        words = paragraph.split()
        pieces.extend(" ".join(words[i:i+180]) for i in range(0, len(words), 180))
    encoded = [tokenizer.encode(p, out_type=str) for p in pieces]
    translated = translator.translate_batch(encoded, beam_size=2, max_decoding_length=512)
    result = "\n\n".join(tokenizer.decode(r.hypotheses[0]).replace("▁", " ").strip() for r in translated)
    label = {"es": "Spanish", "fr": "French", "hi": "Hindi"}[target]
    data, count = text_pdf(result, f"English to {label} — offline translation")
    return result, data, count


def compare(first, second):
    if max(len(first), len(second)) > 100:
        raise ValueError("Comparison is limited to 100 pages per document.")
    text_a = [p.get_text(sort=True) for p in first]
    text_b = [p.get_text(sort=True) for p in second]
    lines = [f"PDF comparison: first file {len(first)} pages; second file {len(second)} pages.",
             "Text changes and rasterized visual changes are reported independently."]
    files = []
    for i in range(max(len(first), len(second))):
        if i >= len(first) or i >= len(second):
            lines.append(f"Page {i+1}: present only in {'second' if i >= len(first) else 'first'} document.")
            continue
        a = Image.open(io.BytesIO(first[i].get_pixmap(dpi=72, colorspace=fitz.csRGB).tobytes("png"))).convert("RGB")
        b = Image.open(io.BytesIO(second[i].get_pixmap(dpi=72, colorspace=fitz.csRGB).tobytes("png"))).convert("RGB")
        size = (max(a.width, b.width), max(a.height, b.height))
        canvas_a, canvas_b = Image.new("RGB", size, "white"), Image.new("RGB", size, "white")
        canvas_a.paste(a, (0, 0))
        canvas_b.paste(b, (0, 0))
        difference = ImageChops.difference(canvas_a, canvas_b)
        box = difference.getbbox()
        text_changed = text_a[i] != text_b[i]
        lines.append(f"Page {i+1}: text {'changed' if text_changed else 'unchanged'}; visual {'changed' if box else 'unchanged'}."
                     + (f" Changed pixel bounds: {box}." if box else ""))
        if text_changed:
            diff = "\n".join(difflib.unified_diff(text_a[i].splitlines(), text_b[i].splitlines(),
                                                   fromfile="first", tofile="second", lineterm=""))
            lines.append(diff[:5000])
        if box:
            buffer = io.BytesIO()
            ImageOps.invert(difference).save(buffer, "PNG")
            files.append((f"page-{i+1:04d}-difference.png", buffer.getvalue()))
    report = "\n\n".join(lines)
    pdf, count = text_pdf(report, "PDF comparison report")
    files += [("comparison-report.pdf", pdf), ("text-differences.txt", report.encode())]
    return zip_outputs(files), report, count