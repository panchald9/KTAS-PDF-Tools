import { Router, type IRouter } from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { InspectDocumentBody, InspectWorkbookBody, InspectWorkbookResponse, ProcessDocumentBody, ProcessDocumentResponse } from "@workspace/api-zod";
import { tools } from "../lib/tool-catalog";
import { wordTools } from "../lib/word-tool-catalog";
import { excelTools } from "../lib/excel-tool-catalog";
import { limits, ProcessingError, runWorker } from "../lib/document-worker";
import { managedTools, advertisingConfig } from "../lib/site-admin";

const router: IRouter = Router();
const traffic = new Map<string, { count: number; reset: number }>();
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});
router.get("/tools", async (_req, res) => res.json((await managedTools()).filter((tool) => tool.enabled)));
router.get("/site-config", async (_req, res) => {
  const advertising = await advertisingConfig();
  const cwd = path.basename(process.cwd()) === "api-server" ? process.cwd() : path.resolve("artifacts/api-server");
  res.json({
    ...limits, adsEnabled: advertising.settings.adsEnabled,
    publisherId: advertising.settings.adsPublisherId || null,
    adSlots: Object.fromEntries(advertising.slots.filter((slot) => slot.enabled && slot.type === "adsense").map((slot) => [slot.name, slot.adUnit])),
    aiEnabled: existsSync(path.join(cwd, "models/en-es/model/model.bin")),
    retention: "Files are kept in private temporary storage only during processing and deleted immediately after each request. No document history is stored.",
  });
});
router.use(["/tools/:slug/process", "/documents/inspect", "/workbooks/inspect"], (req, res, next) => {
  const now = Date.now();
  for (const [key, bucket] of traffic) if (bucket.reset < now) traffic.delete(key);
  const key = req.ip ?? "unknown";
  const bucket = traffic.get(key) ?? {count: 0, reset: now + 60_000};
  bucket.count++;
  traffic.set(key, bucket);
  if (bucket.count > 16) {
    res.setHeader("Retry-After", String(Math.ceil((bucket.reset-now)/1000)));
    res.status(429).json({error: "Too many processing requests. Please wait one minute."});
    return;
  }
  next();
});
router.post("/workbooks/inspect", async (req, res) => {
  const input = InspectWorkbookBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({error: "Choose a valid XLSX workbook and worksheet."}); return; }
  try {
    const result = await runWorker("inspect-workbook", [input.data.file], {sheet: input.data.sheet ?? ""}, ".xlsx");
    res.json(InspectWorkbookResponse.parse(result));
  } catch (error) {
    const e = error instanceof ProcessingError ? error : new ProcessingError("Workbook inspection failed. Check the file.", 503);
    res.status(e.status).json({error: e.message});
  }
});
router.post("/documents/inspect", async (req, res) => {
  const input = InspectDocumentBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({error: "Choose a valid PDF to inspect."}); return; }
  try {
    const result = await runWorker("inspect", [input.data.file], {password: input.data.password ?? ""}, ".pdf");
    res.json(result);
  } catch (error) {
    const e = error instanceof ProcessingError ? error : new ProcessingError("Inspection failed. Check the file and password.", 503);
    res.status(e.status).json({error: e.message});
  }
});
router.post("/tools/:slug/process", async (req, res) => {
  const visibleTool = (await managedTools()).find((t) => t.slug === req.params.slug);
  if (!visibleTool?.enabled) { res.status(404).json({ error: "This tool is currently unavailable." }); return; }
  const tool = [...tools, ...wordTools, ...excelTools].find((t) => t.slug === req.params.slug);
  if (!tool) { res.status(404).json({error: "This tool was not found."}); return; }
  const input = ProcessDocumentBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({error: "Choose supported files and valid tool options."}); return; }
  if (!tool.multiple && input.data.files.length !== 1 && !(tool.slug === "sign-pdf" && input.data.files.length === 2)) {
    res.status(400).json({error: "This tool accepts one document at a time."}); return;
  }
  try {
    const options = Object.fromEntries(tool.options.map(o => [o.key, o.defaultValue]));
    Object.assign(options, input.data.options);
    if (tool.slug === "add-pdf-attachments") {
      if (input.data.files.length < 2 || !input.data.files[0].name.toLowerCase().endsWith(".pdf")) {
        throw new ProcessingError("Upload the destination PDF first, followed by at least one attachment.");
      }
      options.attachmentNames = JSON.stringify(input.data.files.slice(1).map(f => path.basename(f.name)));
    }
    if (Object.keys(options).length > 30 || Object.values(options).some(v => v.length > 20_000)) throw new ProcessingError("The options exceed the allowed size.");
    const accept = tool.slug === "sign-pdf" ? ".pdf,.png" : tool.accept;
    if (tool.slug === "sign-pdf" && !input.data.files[0].name.toLowerCase().endsWith(".pdf")) throw new ProcessingError("The first file must be the PDF document.");
    const result = await runWorker(tool.slug, input.data.files, options, accept);
    res.json(tool.section === "excel" ? ProcessDocumentResponse.parse(result) : result);
  } catch (error) {
    const e = error instanceof ProcessingError ? error : new ProcessingError("Processing failed. Check the file and settings.", 503);
    res.status(e.status).json({error: e.message});
  }
});
export default router;