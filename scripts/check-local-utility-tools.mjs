import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

const baseUrl = process.env.KTAS_PREVIEW_URL ?? "http://localhost:80";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/repl/tools/bin/chromium",
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const processingRequests = [];
  page.on("request", (request) => {
    if (/\/api\/(?:tools\/[^/]+\/process|documents\/inspect|workbooks\/inspect)$/.test(new URL(request.url()).pathname)) {
      processingRequests.push(request.url());
    }
  });
  const toolsResponse = await fetch(`${baseUrl}/api/tools`);
  assert.equal(toolsResponse.status, 200, "The public tool catalog must load.");
  const tools = await toolsResponse.json();
  const imageTools = tools.filter((tool) => tool.section === "image");
  const textTools = tools.filter((tool) => tool.section === "text");
  assert.equal(imageTools.length, 12, "Update image coverage when the public catalog changes.");
  assert.equal(textTools.length, 20, "Update text coverage when the public catalog changes.");

  await page.goto(`${baseUrl}/text/word-counter`);
  await page.getByTestId("input-text").waitFor();

  const imageData = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 32;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("The test browser has no image canvas.");
    context.fillStyle = "#e24c3e";
    context.fillRect(0, 0, 24, 16);
    context.fillStyle = "#267cbc";
    context.fillRect(24, 0, 24, 16);
    context.fillStyle = "#41a85c";
    context.fillRect(0, 16, 24, 16);
    context.fillStyle = "#e1b83f";
    context.fillRect(24, 16, 24, 16);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  const imageBuffer = Buffer.from(imageData, "base64");

  for (const tool of imageTools) {
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, `/image/${tool.slug}`);
    await assert.doesNotReject(() => page.getByTestId("text-tool-name").getByText(tool.name, { exact: true }).waitFor(),
      `Image tool route failed: ${tool.slug}`);
    await page.locator('input[type="file"]').setInputFiles({
      name: "four-color-test.png",
      mimeType: "image/png",
      buffer: imageBuffer,
    });
    if (tool.slug === "resize-image") {
      await page.locator("#option-width").fill("32");
      await page.locator("#option-height").fill("24");
    } else if (tool.slug === "crop-image") {
      await page.locator("#option-width").fill("32");
      await page.locator("#option-height").fill("24");
    }
    await page.getByRole("button", { name: "Process image" }).click();
    await page.getByTestId("panel-result").waitFor();
    const resultImage = page.getByRole("img", { name: "Processed image preview" });
    await resultImage.evaluate(async (image) => {
      if (!(image instanceof HTMLImageElement)) throw new Error("The result preview is not an image.");
      await image.decode();
      if (!image.naturalWidth || !image.naturalHeight) throw new Error("The image result is blank.");
    });
    await assert.rejects(
      () => page.getByRole("alert").waitFor({ state: "visible", timeout: 100 }),
      `Image tool showed an error after processing: ${tool.slug}`,
    );
    console.log(`PASS image ${tool.slug}`);
  }

  const cases = {
    "word-counter": { input: "A quick brown fox.", contains: ["Words: 4", "Lines: 1"] },
    "case-converter": { input: "Hello Café!", options: { mode: "upper" }, exact: "HELLO CAFÉ!" },
    "remove-duplicate-lines": { input: "alpha\nbeta\nalpha", exact: "alpha\nbeta" },
    "sort-lines": { input: "zebra\napple\nmango", exact: "apple\nmango\nzebra" },
    "find-and-replace": { input: "red cat, red dog", options: { find: "red", replace: "blue" }, exact: "blue cat, blue dog" },
    "remove-extra-spaces": { input: "alpha   beta\tgamma\nnext", exact: "alpha beta gamma\nnext" },
    "reverse-text": { input: "one\ntwo\nthree", options: { mode: "lines" }, exact: "three\ntwo\none" },
    "slug-generator": { input: "Hello, Café & Toolkit!", exact: "hello-cafe-toolkit" },
    "text-to-base64": { input: "Hello café", exact: "SGVsbG8gY2Fmw6k=" },
    "base64-to-text": { input: "SGVsbG8gY2Fmw6k=", exact: "Hello café" },
    "url-encode": { input: "hello world & café", exact: "hello%20world%20%26%20caf%C3%A9" },
    "url-decode": { input: "hello%20world%20%26%20caf%C3%A9", exact: "hello world & café" },
    "json-formatter": { input: '{"tools":["pdf","word"],"count":2}', contains: ['"tools": [', '"count": 2'] },
    "html-escape": { input: `<h1 title="test">Hello & welcome</h1>`, contains: ["&lt;h1", "&amp; welcome", "&lt;/h1&gt;"] },
    "remove-empty-lines": { input: "first\n\nsecond\n \nthird", exact: "first\nsecond\nthird" },
    "extract-emails": { input: "First@Example.com and first@example.com plus help@example.org", contains: ["first@example.com", "help@example.org"] },
    "extract-urls": { input: "Read https://example.com/a and https://example.org.", contains: ["https://example.com/a", "https://example.org"] },
    "add-line-numbers": { input: "alpha\nbeta\ngamma", options: { start: "5" }, exact: "5. alpha\n6. beta\n7. gamma" },
    "trim-text": { input: "  alpha  \n  beta  ", exact: "alpha\nbeta" },
    "compare-text": { input: "alpha\nold value\nunchanged", options: { secondText: "alpha\nnew value\nunchanged" }, contains: ["- old value", "+ new value", "1 added lines", "1 removed lines"] },
  };

  for (const tool of textTools) {
    const test = cases[tool.slug];
    assert.ok(test, `Text tool ${tool.slug} does not have an output assertion.`);
    await page.evaluate((path) => {
      history.pushState({}, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, `/text/${tool.slug}`);
    await page.getByTestId("text-tool-name").getByText(tool.name, { exact: true }).waitFor();
    await page.getByTestId("input-text").fill(test.input);
    for (const [key, value] of Object.entries(test.options ?? {})) {
      const option = page.locator(`#option-${key}`);
      if (await option.evaluate((element) => element instanceof HTMLSelectElement)) {
        await option.selectOption(value);
      } else {
        await option.fill(value);
      }
    }
    await page.getByRole("button", { name: `Run ${tool.name}` }).click();
    await page.getByTestId("panel-result").waitFor();
    const output = await page.getByTestId("text-result").inputValue();
    if ("exact" in test) assert.equal(output, test.exact, `${tool.slug} produced the wrong output.`);
    for (const fragment of test.contains ?? []) assert.ok(output.includes(fragment), `${tool.slug} output is missing: ${fragment}`);
    console.log(`PASS text ${tool.slug}`);
  }

  assert.deepEqual(processingRequests, [], "Browser-local image and text tools must not upload content to processing APIs.");
  console.log(`PASS privacy: all ${imageTools.length + textTools.length} image/text tools ran without a document-processing API request.`);
} finally {
  await browser.close();
}