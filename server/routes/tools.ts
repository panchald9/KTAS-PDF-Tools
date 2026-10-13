import { Router } from "express";
import { tools } from "../../shared/catalogs/tool-catalog";
import { wordTools } from "../../shared/catalogs/word-tool-catalog";
import { excelTools } from "../../shared/catalogs/excel-tool-catalog";
import { runWorker, ProcessingError } from "../engine";
import { managedTools, advertisingConfig } from "../lib/site-admin";

const router = Router();
const limits = {
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024,
  maxFiles: 20,
  maxPages: 1000,
};

router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  next();
});

router.get("/tools", async (_req, res) => {
  const allTools = await managedTools();
  res.json(allTools.filter((t) => t.enabled));
});

router.get("/site-config", async (_req, res) => {
  const advertising = await advertisingConfig();
  res.json({
    ...limits,
    adsEnabled: advertising.settings.adsEnabled,
    publisherId: advertising.settings.adsPublisherId || null,
    adSlots: Object.fromEntries(
      advertising.slots
        .filter((slot) => slot.enabled && slot.type === "adsense")
        .map((slot) => [slot.name, slot.adUnit])
    ),
    aiEnabled: false,
    retention: "Files are kept in private temporary storage only during processing and deleted immediately after each request. No document history is stored.",
  });
});

router.post("/workbooks/inspect", async (req, res) => {
  const { file, sheet } = req.body || {};
  if (!file || !file.dataBase64) {
    res.status(400).json({ error: "Choose a valid XLSX workbook." });
    return;
  }
  try {
    const result = await runWorker("inspect-workbook", [file], { sheet: sheet || "" });
    res.json(result);
  } catch (error: any) {
    const status = error instanceof ProcessingError ? error.status : 503;
    res.status(status).json({ error: error.message || "Workbook inspection failed." });
  }
});

router.post("/documents/inspect", async (req, res) => {
  const { file, password } = req.body || {};
  if (!file || !file.dataBase64) {
    res.status(400).json({ error: "Choose a valid PDF to inspect." });
    return;
  }
  try {
    const result = await runWorker("inspect", [file], { password: password || "" });
    res.json(result);
  } catch (error: any) {
    const status = error instanceof ProcessingError ? error.status : 503;
    res.status(status).json({ error: error.message || "Document inspection failed." });
  }
});

router.post("/tools/:slug/process", async (req, res) => {
  const slug = req.params.slug;
  const visibleList = await managedTools();
  const visibleTool = visibleList.find((t) => t.slug === slug);
  if (!visibleTool?.enabled) {
    res.status(404).json({ error: "This tool is currently unavailable." });
    return;
  }

  const allDefinitions = [...tools, ...wordTools, ...excelTools];
  const tool = allDefinitions.find((t) => t.slug === slug);
  if (!tool) {
    res.status(404).json({ error: "This tool was not found." });
    return;
  }

  const { files, options = {} } = req.body || {};
  if (!files || !Array.isArray(files) || !files.length) {
    res.status(400).json({ error: "Please upload at least one file." });
    return;
  }

  if (!tool.multiple && files.length !== 1 && !(tool.slug === "sign-pdf" && files.length === 2)) {
    res.status(400).json({ error: "This tool accepts one document at a time." });
    return;
  }

  try {
    const toolOptions = Object.fromEntries(tool.options.map((o) => [o.key, o.defaultValue]));
    Object.assign(toolOptions, options);

    const result = await runWorker(tool.slug, files, toolOptions, tool.accept);
    res.json(result);
  } catch (error: any) {
    const status = error instanceof ProcessingError ? error.status : 503;
    res.status(status).json({ error: error.message || "Processing failed. Check the file and settings." });
  }
});

export default router;
