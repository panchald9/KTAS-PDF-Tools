import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import AdmZip from "adm-zip";
import type { DocumentFileInput } from "../../shared/types";

export interface EngineResult {
  files: Array<{
    name: string;
    mimeType: string;
    dataBase64: string;
    bytes: number;
  }>;
  message: string;
  warnings: string[];
  originalBytes: number;
  outputBytes: number;
  pageCount: number;
  text: string;
}

export function parsePageRange(rangeStr: string, totalPages: number, allowDuplicates = false, required = false): number[] {
  const trimmed = (rangeStr || "").trim();
  if (!trimmed) {
    if (required) throw new Error("Enter the page numbers or ranges to process.");
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  const result: number[] = [];
  const parts = trimmed.split(",");
  for (const part of parts) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error("Use page numbers and ranges such as 1,3-5.");
    const start = parseInt(match[1], 10);
    const end = match[2] ? parseInt(match[2], 10) : start;
    if (start < 1 || start > totalPages || end < 1 || end > totalPages) {
      throw new Error(`Page numbers must be between 1 and ${totalPages}.`);
    }
    const step = start <= end ? 1 : -1;
    for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
      result.push(p - 1);
    }
  }
  if (!allowDuplicates) {
    return Array.from(new Set(result));
  }
  return result;
}

export async function inspectPdf(file: DocumentFileInput, password = "") {
  const buffer = Buffer.from(file.dataBase64, "base64");
  let doc: PDFDocument;
  try {
    doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
  } catch {
    throw new Error("Please upload a valid PDF document.");
  }

  const pageCount = doc.getPageCount();
  const encrypted = doc.isEncrypted;
  const pages = [];
  const previewLimit = Math.min(pageCount, 12);

  for (let i = 0; i < pageCount; i++) {
    const page = doc.getPage(i);
    const { width, height } = page.getSize();
    const rotation = page.getRotation().angle;
    let previewBase64 = "";

    // Generate a rich, clean document mockup SVG preview for previewLimit pages
    if (i < previewLimit) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(width * 0.4)}" height="${Math.round(height * 0.4)}" viewBox="0 0 ${width} ${height}">
        <rect width="100%" height="100%" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
        <rect x="12%" y="10%" width="45%" height="3.5%" rx="3" fill="#087d78"/>
        <rect x="12%" y="16%" width="76%" height="1.2%" rx="1" fill="#e2e8f0"/>
        <rect x="12%" y="22%" width="76%" height="1.8%" rx="2" fill="#94a3b8" opacity="0.7"/>
        <rect x="12%" y="26%" width="70%" height="1.8%" rx="2" fill="#cbd5e1"/>
        <rect x="12%" y="30%" width="74%" height="1.8%" rx="2" fill="#cbd5e1"/>
        <rect x="12%" y="34%" width="55%" height="1.8%" rx="2" fill="#cbd5e1"/>
        <rect x="12%" y="42%" width="76%" height="1.8%" rx="2" fill="#94a3b8" opacity="0.7"/>
        <rect x="12%" y="46%" width="68%" height="1.8%" rx="2" fill="#cbd5e1"/>
        <rect x="12%" y="50%" width="72%" height="1.8%" rx="2" fill="#cbd5e1"/>
        <rect x="12%" y="54%" width="40%" height="1.8%" rx="2" fill="#cbd5e1"/>
        <rect x="22%" y="65%" width="56%" height="15%" rx="10" fill="#f0fdf4" stroke="#86efac" stroke-width="2.5"/>
        <text x="50%" y="74.5%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="32" font-weight="700" fill="#15803d">Page ${i + 1}</text>
        <text x="50%" y="93%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#94a3b8">— ${i + 1} —</text>
      </svg>`;
      previewBase64 = Buffer.from(svg).toString("base64");
    }

    pages.push({
      number: i + 1,
      width,
      height,
      rotation,
      previewBase64,
    });
  }

  const formFields = [];
  try {
    const form = doc.getForm();
    const fields = form.getFields();
    for (const field of fields) {
      formFields.push({
        name: field.getName(),
        value: "",
        type: field.constructor.name,
        page: 1,
      });
    }
  } catch {
    // Form fields are optional
  }

  return {
    pageCount,
    encrypted,
    pages,
    formFields,
  };
}

export async function processPdfTool(
  slug: string,
  files: DocumentFileInput[],
  options: Record<string, string>
): Promise<EngineResult> {
  const originalBytes = files.reduce((acc, f) => acc + Buffer.from(f.dataBase64, "base64").length, 0);
  const firstBuffer = Buffer.from(files[0].dataBase64, "base64");
  const warnings: string[] = [];
  let message = "Your document has been processed.";
  let outData: Buffer;
  let outExtension = ".pdf";
  let outMime = "application/pdf";
  let pageCount = 0;
  let text = "";

  if (slug === "jpg-to-pdf" || slug === "scan-to-pdf") {
    const pdfDoc = await PDFDocument.create();
    const pageSize = options.size || "A4";
    const orientation = options.orientation || "portrait";
    const margin = Number(options.margin || 24);

    const dims = pageSize === "Letter" ? [612, 792] : [595.28, 841.89];
    const pageWidth = orientation === "landscape" ? dims[1] : dims[0];
    const pageHeight = orientation === "landscape" ? dims[0] : dims[1];

    for (const f of files) {
      const imgBuffer = Buffer.from(f.dataBase64, "base64");
      const isPng = f.name.toLowerCase().endsWith(".png");
      const embedded = isPng ? await pdfDoc.embedPng(imgBuffer) : await pdfDoc.embedJpg(imgBuffer);
      const page = pdfDoc.addPage([pageWidth, pageHeight]);

      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;
      const scale = Math.min(availableWidth / embedded.width, availableHeight / embedded.height, 1);
      const drawWidth = embedded.width * scale;
      const drawHeight = embedded.height * scale;
      const x = margin + (availableWidth - drawWidth) / 2;
      const y = margin + (availableHeight - drawHeight) / 2;

      page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
    }
    const bytes = await pdfDoc.save();
    outData = Buffer.from(bytes);
    pageCount = pdfDoc.getPageCount();
  } else if (slug === "merge-pdf") {
    if (files.length < 2) throw new Error("Choose at least two PDFs to merge.");
    const mergedDoc = await PDFDocument.create();
    for (const file of files) {
      const buf = Buffer.from(file.dataBase64, "base64");
      const srcDoc = await PDFDocument.load(buf, { ignoreEncryption: true });
      const indices = srcDoc.getPageIndices();
      const copied = await mergedDoc.copyPages(srcDoc, indices);
      copied.forEach((p) => mergedDoc.addPage(p));
    }
    const bytes = await mergedDoc.save();
    outData = Buffer.from(bytes);
    pageCount = mergedDoc.getPageCount();
  } else {
    const doc = await PDFDocument.load(firstBuffer, { ignoreEncryption: true });
    pageCount = doc.getPageCount();

    if (slug === "split-pdf") {
      const mode = options.mode || "range";
      if (mode === "every-page") {
        const zip = new AdmZip();
        for (let i = 0; i < pageCount; i++) {
          const single = await PDFDocument.create();
          const [copied] = await single.copyPages(doc, [i]);
          single.addPage(copied);
          const singleBytes = await single.save();
          const numStr = String(i + 1).padStart(4, "0");
          zip.addFile(`page-${numStr}.pdf`, Buffer.from(singleBytes));
        }
        outData = zip.toBuffer();
        outExtension = ".zip";
        outMime = "application/zip";
        message = "Every page was split into a separate PDF archive.";
      } else {
        const indices = parsePageRange(options.pages || "", pageCount);
        const subDoc = await PDFDocument.create();
        const copied = await subDoc.copyPages(doc, indices);
        copied.forEach((p) => subDoc.addPage(p));
        const bytes = await subDoc.save();
        outData = Buffer.from(bytes);
        pageCount = subDoc.getPageCount();
      }
    } else if (slug === "remove-pages") {
      const removed = new Set(parsePageRange(options.pages || "", pageCount, false, true));
      const remainingIndices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => !removed.has(i));
      if (!remainingIndices.length) throw new Error("At least one page must remain.");
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc, remainingIndices);
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      outData = Buffer.from(bytes);
      pageCount = newDoc.getPageCount();
    } else if (slug === "organize-pdf") {
      const order = parsePageRange(options.order || "", pageCount, true);
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc, order);
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      outData = Buffer.from(bytes);
      pageCount = newDoc.getPageCount();
    } else if (slug === "rotate-pdf") {
      const angle = Number(options.angle || 90);
      const indices = parsePageRange(options.pages || "", pageCount);
      for (const idx of indices) {
        const page = doc.getPage(idx);
        const current = page.getRotation().angle;
        page.setRotation(degrees((current + angle) % 360));
      }
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "reverse-pdf") {
      const indices = Array.from({ length: pageCount }, (_, i) => pageCount - 1 - i);
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc, indices);
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "extract-pages") {
      const indices = parsePageRange(options.pages || "", pageCount, false, true);
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc, indices);
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      outData = Buffer.from(bytes);
      pageCount = newDoc.getPageCount();
    } else if (slug === "duplicate-pages") {
      const dup = new Set(parsePageRange(options.pages || "1", pageCount, false, true));
      const newIndices: number[] = [];
      for (let i = 0; i < pageCount; i++) {
        newIndices.push(i);
        if (dup.has(i)) newIndices.push(i);
      }
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc, newIndices);
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      outData = Buffer.from(bytes);
      pageCount = newDoc.getPageCount();
    } else if (slug === "odd-pages" || slug === "even-pages") {
      const isOdd = slug === "odd-pages";
      const indices = Array.from({ length: pageCount }, (_, i) => i).filter((i) => (isOdd ? i % 2 === 0 : i % 2 === 1));
      if (!indices.length) throw new Error(isOdd ? "No odd pages found." : "A one-page document has no even pages.");
      const newDoc = await PDFDocument.create();
      const copied = await newDoc.copyPages(doc, indices);
      copied.forEach((p) => newDoc.addPage(p));
      const bytes = await newDoc.save();
      outData = Buffer.from(bytes);
      pageCount = newDoc.getPageCount();
    } else if (slug === "add-blank-pages") {
      const after = Math.min(Math.max(Number(options.after || 0), 0), pageCount);
      const count = Math.min(Math.max(Number(options.count || 1), 1), 100);
      const { width, height } = doc.getPage(0).getSize();
      for (let i = 0; i < count; i++) {
        doc.insertPage(after + i, [width, height]);
      }
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
      pageCount = doc.getPageCount();
    } else if (slug === "page-numbers") {
      const startNum = Number(options.start || 1);
      const location = options.location || "bottom-center";
      const indices = parsePageRange(options.pages || "", pageCount);
      const font = await doc.embedFont(StandardFonts.Helvetica);

      for (let i = 0; i < indices.length; i++) {
        const pageIdx = indices[i];
        const page = doc.getPage(pageIdx);
        const { width, height } = page.getSize();
        const pageNumText = String(startNum + i);
        const textWidth = font.widthOfTextAtSize(pageNumText, 10);
        let x = width / 2 - textWidth / 2;
        let y = 24;

        if (location.includes("top")) y = height - 28;
        if (location.includes("right")) x = width - textWidth - 36;
        if (location.includes("left")) x = 36;

        page.drawText(pageNumText, { x, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
      }
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "watermark-pdf") {
      const watermarkText = options.text || "CONFIDENTIAL";
      const opacity = Math.min(Math.max(Number(options.opacity || 0.2), 0.05), 1);
      const indices = parsePageRange(options.pages || "", pageCount);
      const font = await doc.embedFont(StandardFonts.HelveticaBold);

      for (const idx of indices) {
        const page = doc.getPage(idx);
        const { width, height } = page.getSize();
        const fontSize = 48;
        const textWidth = font.widthOfTextAtSize(watermarkText, fontSize);
        page.drawText(watermarkText, {
          x: (width - textWidth) / 2,
          y: height / 2,
          size: fontSize,
          font,
          color: rgb(0.7, 0.1, 0.1),
          opacity,
          rotate: degrees(45),
        });
      }
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "crop-pdf") {
      const margin = Number(options.margin || 24);
      const indices = parsePageRange(options.pages || "", pageCount);
      for (const idx of indices) {
        const page = doc.getPage(idx);
        const { width, height } = page.getSize();
        if (margin * 2 >= width || margin * 2 >= height) {
          throw new Error("Margin is larger than page dimensions.");
        }
        page.setCropBox(margin, margin, width - margin * 2, height - margin * 2);
      }
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "edit-pdf") {
      const editText = options.text || "";
      const pageNum = Math.min(Math.max(Number(options.page || 1), 1), pageCount);
      const x = Number(options.x || 50);
      const y = Number(options.y || 100);
      const fontSize = Number(options.fontSize || 16);
      const page = doc.getPage(pageNum - 1);
      const { height } = page.getSize();
      const font = await doc.embedFont(StandardFonts.Helvetica);
      page.drawText(editText, { x, y: height - y, size: fontSize, font, color: rgb(0, 0, 0) });
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "sign-pdf") {
      const pageNum = Math.min(Math.max(Number(options.page || 1), 1), pageCount);
      const x = Number(options.x || 50);
      const y = Number(options.y || 100);
      const page = doc.getPage(pageNum - 1);
      const { height } = page.getSize();

      if (files.length > 1 && files[1].name.toLowerCase().endsWith(".png")) {
        const sigPng = Buffer.from(files[1].dataBase64, "base64");
        const embeddedPng = await doc.embedPng(sigPng);
        const w = Math.min(embeddedPng.width, 200);
        const h = embeddedPng.height * (w / embeddedPng.width);
        page.drawImage(embeddedPng, { x, y: height - y - h, width: w, height: h });
      } else {
        const sigText = options.signatureText || "Signed";
        const font = await doc.embedFont(StandardFonts.TimesRomanItalic);
        page.drawText(sigText, { x, y: height - y, size: 24, font, color: rgb(0.05, 0.1, 0.4) });
      }
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "flatten-pdf") {
      try {
        const form = doc.getForm();
        form.flatten();
      } catch {}
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "compress-pdf" || slug === "repair-pdf") {
      const bytes = await doc.save({ useObjectStreams: true });
      outData = Buffer.from(bytes);
      if (outData.length < originalBytes) {
        const reduction = (100 * (1 - outData.length / originalBytes)).toFixed(1);
        message = `Reduced the actual file size by ${reduction}%.`;
      } else {
        outData = firstBuffer;
        message = "No smaller result was found. Your original document is returned unchanged.";
      }
    } else if (slug === "set-pdf-metadata") {
      if (options.title) doc.setTitle(options.title);
      if (options.author) doc.setAuthor(options.author);
      if (options.subject) doc.setSubject(options.subject);
      if (options.keywords) doc.setKeywords(options.keywords.split(","));
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "remove-pdf-metadata") {
      doc.setTitle("");
      doc.setAuthor("");
      doc.setSubject("");
      doc.setKeywords([]);
      doc.setCreator("");
      doc.setProducer("");
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    } else if (slug === "pdf-metadata") {
      const meta = {
        pageCount,
        title: doc.getTitle() || "",
        author: doc.getAuthor() || "",
        subject: doc.getSubject() || "",
        keywords: doc.getKeywords() || [],
        creator: doc.getCreator() || "",
        producer: doc.getProducer() || "",
        creationDate: doc.getCreationDate(),
        modificationDate: doc.getModificationDate(),
      };
      outData = Buffer.from(JSON.stringify(meta, null, 2), "utf8");
      outExtension = ".json";
      outMime = "application/json";
      message = "PDF metadata extracted successfully.";
    } else if (slug === "pdf-to-json") {
      const pagesInfo = [];
      for (let i = 0; i < pageCount; i++) {
        const p = doc.getPage(i);
        const { width, height } = p.getSize();
        pagesInfo.push({ page: i + 1, width, height, rotation: p.getRotation().angle });
      }
      const dataJson = {
        fileName: files[0].name,
        pageCount,
        pages: pagesInfo,
        metadata: {
          title: doc.getTitle() || "",
          author: doc.getAuthor() || "",
        },
      };
      outData = Buffer.from(JSON.stringify(dataJson, null, 2), "utf8");
      outExtension = ".json";
      outMime = "application/json";
    } else if (slug === "pdf-word-count") {
      const wordCountResult = {
        pages: pageCount,
        estimatedWords: pageCount * 250,
        estimatedCharacters: pageCount * 1500,
      };
      outData = Buffer.from(JSON.stringify(wordCountResult, null, 2), "utf8");
      outExtension = ".json";
      outMime = "application/json";
      message = `Document has ${pageCount} pages.`;
    } else {
      // Default: clean save
      const bytes = await doc.save();
      outData = Buffer.from(bytes);
    }
  }

  const baseName = files[0].name.replace(/\.[^/.]+$/, "");
  const outputFileName = `${baseName}-processed${outExtension}`;

  return {
    files: [
      {
        name: outputFileName,
        mimeType: outMime,
        dataBase64: outData.toString("base64"),
        bytes: outData.length,
      },
    ],
    message,
    warnings,
    originalBytes,
    outputBytes: outData.length,
    pageCount,
    text,
  };
}
