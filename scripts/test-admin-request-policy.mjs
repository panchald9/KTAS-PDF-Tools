import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(new URL("../artifacts/api-server/package.json", import.meta.url));
const { build } = require("esbuild");
const directory = await mkdtemp(path.join(tmpdir(), "ktas-admin-policy-"));
try {
  const outfile = path.join(directory, "policy.mjs");
  await build({
    entryPoints: [new URL("../artifacts/api-server/src/lib/admin-request-policy.ts", import.meta.url).pathname],
    bundle: true, platform: "node", format: "esm", outfile, logLevel: "silent",
  });
  const { adminMutationAllowed } = await import(pathToFileURL(outfile).href);
  const cases = [
    [undefined, "ktastools.com", undefined, true],
    ["https://ktastools.com", "ktastools.com", "same-origin", true],
    ["http://localhost:80", "localhost:80", undefined, false], // URL canonicalizes port 80.
    ["http://localhost", "localhost", undefined, true],
    ["https://example.com", "ktastools.com", undefined, false],
    ["https://ktastools.com", "ktastools.com", "cross-site", false],
    [undefined, "ktastools.com", "cross-site", false],
    ["not a URL", "ktastools.com", undefined, false],
    ["null", "ktastools.com", undefined, false],
    ["https://ktastools.com/path", "ktastools.com", undefined, false],
    ["https://user:password@ktastools.com", "ktastools.com", undefined, false],
    ["ftp://ktastools.com", "ktastools.com", undefined, false],
    ["https://ktastools.com", undefined, undefined, false],
  ];
  for (const [origin, host, fetchSite, expected] of cases) {
    assert.equal(adminMutationAllowed(origin, host, fetchSite), expected, `Origin=${origin}; host=${host}; fetch-site=${fetchSite}`);
  }
  console.log(`Admin request policy: ${cases.length} checks passed.`);
} finally {
  await rm(directory, { recursive: true, force: true });
}