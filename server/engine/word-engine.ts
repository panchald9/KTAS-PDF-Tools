import AdmZip from "adm-zip";
import type { DocumentFileInput } from "../../shared/types";
import type { EngineResult } from "./pdf-engine";

function createMinimalDocx(text: string, title = "Document"): Buffer {
  const zip = new AdmZip();
  const escapedTitle = title.replace(/[<>&]/g, "");
  const paragraphs = text
    .split(/\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<w:p><w:r><w:t>${p.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</w:t></w:r></w:p>`)
    .join("");

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapedTitle}</w:t></w:r></w:p>
    ${paragraphs}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>
  </w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  zip.addFile("[Content_Types].xml", Buffer.from(contentTypes, "utf8"));
  zip.addFile("_rels/.rels", Buffer.from(rels, "utf8"));
  zip.addFile("word/document.xml", Buffer.from(docXml, "utf8"));

  return zip.toBuffer();
}

function extractDocxText(docXml: string): string {
  const pMatches = docXml.match(/<w:p[\s>].*?<\/w:p>/gs) || [];
  const lines: string[] = [];
  for (const p of pMatches) {
    const tMatches = p.match(/<w:t[^>]*>(.*?)<\/w:t>/gs) || [];
    const text = tMatches.map((t) => t.replace(/<[^>]+>/g, "")).join("");
    if (text.trim()) lines.push(text);
  }
  return lines.join("\n\n");
}

export async function processWordTool(
  slug: string,
  files: DocumentFileInput[],
  options: Record<string, string>
): Promise<EngineResult> {
  const originalBytes = files.reduce((acc, f) => acc + Buffer.from(f.dataBase64, "base64").length, 0);
  const firstBuffer = Buffer.from(files[0].dataBase64, "base64");
  const warnings: string[] = [];
  let message = "Your Word document has been processed.";
  let outData: Buffer;
  let outExtension = ".docx";
  let outMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  if (slug === "text-to-word") {
    const textContent = firstBuffer.toString("utf8");
    outData = createMinimalDocx(textContent, options.title || "Document");
  } else if (slug === "merge-word") {
    if (files.length < 2) throw new Error("Upload at least two Word documents to merge.");
    const firstZip = new AdmZip(firstBuffer);
    let firstDocXml = firstZip.readAsText("word/document.xml");
    const bodyMatch = firstDocXml.match(/<w:body>(.*?)<\/w:body>/s);
    let combinedBody = bodyMatch ? bodyMatch[1].replace(/<w:sectPr>.*?<\/w:sectPr>/gs, "") : "";

    for (let i = 1; i < files.length; i++) {
      const buf = Buffer.from(files[i].dataBase64, "base64");
      const zip = new AdmZip(buf);
      const docXml = zip.readAsText("word/document.xml");
      const subMatch = docXml.match(/<w:body>(.*?)<\/w:body>/s);
      if (subMatch) {
        combinedBody += subMatch[1].replace(/<w:sectPr>.*?<\/w:sectPr>/gs, "");
      }
    }
    const mergedDocXml = firstDocXml.replace(/<w:body>.*?<\/w:body>/s, `<w:body>${combinedBody}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body>`);
    firstZip.updateFile("word/document.xml", Buffer.from(mergedDocXml, "utf8"));
    outData = firstZip.toBuffer();
  } else {
    const zip = new AdmZip(firstBuffer);
    const docXml = zip.readAsText("word/document.xml");

    if (slug === "word-to-text") {
      const extracted = extractDocxText(docXml);
      outData = Buffer.from(extracted, "utf8");
      outExtension = ".txt";
      outMime = "text/plain";
    } else if (slug === "word-to-html") {
      const paragraphs = extractDocxText(docXml).split("\n\n");
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Export</title></head><body>${paragraphs.map((p) => `<p>${p.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!)}</p>`).join("")}</body></html>`;
      outData = Buffer.from(html, "utf8");
      outExtension = ".html";
      outMime = "text/html";
    } else if (slug === "extract-word-images") {
      const imgZip = new AdmZip();
      let found = 0;
      for (const entry of zip.getEntries()) {
        if (entry.entryName.startsWith("word/media/") && !entry.isDirectory) {
          imgZip.addFile(entry.name, entry.getData());
          found++;
        }
      }
      if (!found) throw new Error("No embedded images were found in this document.");
      outData = imgZip.toBuffer();
      outExtension = ".zip";
      outMime = "application/zip";
      message = `Extracted ${found} images into an archive.`;
    } else if (slug === "word-statistics") {
      const text = extractDocxText(docXml);
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;
      const paragraphs = (docXml.match(/<w:p[\s>]/g) || []).length;
      const tables = (docXml.match(/<w:tbl[\s>]/g) || []).length;
      const images = zip.getEntries().filter((e) => e.entryName.startsWith("word/media/")).length;

      const stats = { words, characters: chars, paragraphs, tables, images };
      outData = Buffer.from(JSON.stringify(stats, null, 2), "utf8");
      outExtension = ".json";
      outMime = "application/json";
    } else if (slug === "find-replace-word") {
      const findText = options.find || "";
      const replaceText = options.replace || "";
      if (!findText) throw new Error("Enter the text to find.");

      // Replace literal occurrences in document.xml
      const newDocXml = docXml.replaceAll(findText, replaceText);
      zip.updateFile("word/document.xml", Buffer.from(newDocXml, "utf8"));
      outData = zip.toBuffer();
      message = `Replaced occurrences of '${findText}'.`;
    } else if (slug === "remove-word-comments") {
      zip.deleteFile("word/comments.xml");
      let cleaned = docXml.replace(/<w:commentRangeStart[^>]*\/>/g, "");
      cleaned = cleaned.replace(/<w:commentRangeEnd[^>]*\/>/g, "");
      cleaned = cleaned.replace(/<w:commentReference[^>]*\/>/g, "");
      zip.updateFile("word/document.xml", Buffer.from(cleaned, "utf8"));
      outData = zip.toBuffer();
      message = "Comments removed from document.";
    } else if (slug === "remove-word-empty-paragraphs") {
      const cleaned = docXml.replace(/<w:p[^>]*>\s*(?:<w:pPr>.*?<\/w:pPr>\s*)?<\/w:p>/gs, "");
      zip.updateFile("word/document.xml", Buffer.from(cleaned, "utf8"));
      outData = zip.toBuffer();
      message = "Empty paragraphs removed.";
    } else {
      outData = zip.toBuffer();
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
    pageCount: 1,
    text: "",
  };
}
