import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, access } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DocumentFileInput } from "@workspace/api-zod";

export const limits = {
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 30 * 1024 * 1024,
  maxFiles: 20,
  maxPages: 1000,
};
export class ProcessingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
let activeWorkers = 0;
// Bundled production code sits in dist; the source path is resolved from the artifact cwd.
const artifactDir = path.basename(process.cwd()) === "api-server" ? process.cwd() : path.resolve("artifacts/api-server");
const script = path.join(artifactDir, "python/worker.py");
const python = path.resolve(artifactDir, "../../.pythonlibs/bin/python3");

export function decodeFiles(files: DocumentFileInput[], accept: string) {
  const extensions = new Set(accept.split(","));
  let total = 0;
  return files.map((file) => {
    const extension = path.extname(file.name).toLowerCase();
    if (!extensions.has(extension)) throw new ProcessingError(`Unsupported file type: ${extension || "no extension"}. Choose ${accept}.`);
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(file.dataBase64) || file.dataBase64.length % 4 !== 0) throw new ProcessingError("Invalid uploaded file encoding.");
    const data = Buffer.from(file.dataBase64, "base64");
    if (!data.length || data.length > limits.maxFileBytes) throw new ProcessingError("Each file must be non-empty and no larger than 20 MB.");
    total += data.length;
    if (total > limits.maxTotalBytes) throw new ProcessingError("Combined uploads cannot exceed 30 MB.");
    // Strict, simple file signatures; Office engines perform the deeper document parsing.
    if (extension === ".pdf" && !data.subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new ProcessingError("This file is not an actual PDF.");
    if ([".docx", ".pptx", ".xlsx", ".odt", ".ods", ".odp"].includes(extension) && data.subarray(0,2).toString() !== "PK") throw new ProcessingError("This file is not a valid Office package.");
    return { data, extension };
  });
}

export async function runWorker(slug: string, files: DocumentFileInput[], options: Record<string,string>, accept: string): Promise<unknown> {
  if (activeWorkers >= 2) throw new ProcessingError("The local processors are busy. Please retry shortly.", 429);
  const decoded = decodeFiles(files, accept);
  activeWorkers++;
  let directory: string | undefined;
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), "ktas-private-"));
    const paths = await Promise.all(decoded.map(async ({data, extension}, i) => {
      const name = path.join(directory!, `input-${i}${extension}`);
      await writeFile(name, data, { mode: 0o600 });
      return name;
    }));
    await access(script, constants.R_OK);
    return await new Promise((resolve, reject) => {
      const child = spawn(python, [script], {
        cwd: directory,
        // Don't pass SESSION_SECRET, API keys or any other inherited credential to native engines.
        env: { PATH: process.env.PATH, HOME: directory, LANG: "C.UTF-8", PYTHONUNBUFFERED: "1",
          PYTHONDONTWRITEBYTECODE: "1", OMP_NUM_THREADS: "2", OPENBLAS_NUM_THREADS: "2",
          LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH, FONTCONFIG_FILE: process.env.FONTCONFIG_FILE,
          FONTCONFIG_PATH: process.env.FONTCONFIG_PATH },
        stdio: ["pipe", "pipe", "ignore"],
        detached: true,
      });
      let bytes = 0;
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => {
        try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch {}
        reject(new ProcessingError("Processing exceeded the time limit. Try a smaller document.", 408));
      }, 240_000);
      child.stdout.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 115 * 1024 * 1024) {
          try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch {}
          reject(new ProcessingError("Output exceeds the size limit. Try fewer pages.", 413));
        } else chunks.push(chunk);
      });
      child.once("error", () => {
        clearTimeout(timer);
        reject(new ProcessingError("The local processing engine could not start.", 503));
      });
      child.once("close", () => {
        clearTimeout(timer);
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString("utf8").trim().split("\n").at(-1) ?? "");
          if (!result.ok) reject(new ProcessingError(result.error, result.status));
          else resolve(result.result);
        } catch {
          reject(new ProcessingError("The processor did not finish. Try a smaller or different document.", 503));
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(JSON.stringify({ slug, paths, options }));
    });
  } finally {
    if (directory) await rm(directory, { recursive: true, force: true });
    activeWorkers--;
  }
}