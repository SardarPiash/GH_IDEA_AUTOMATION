import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { spawn } from "child_process";
import os from "os";
import path from "path";
import { buildIdeaDocumentHtml } from "@/lib/docHtml";

function chromePath() {
  return (
    process.env.CHROME_PATH?.trim() ||
    process.env.PUPPETEER_EXECUTABLE_PATH?.trim() ||
    "/usr/bin/google-chrome"
  );
}

function runChrome(htmlPath: string, pdfPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      chromePath(),
      [
        "--headless=new",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        `--print-to-pdf=${pdfPath}`,
        "--no-pdf-header-footer",
        `file://${htmlPath}`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `Chrome exited with code ${code}`));
    });
  });
}

export async function buildIdeaPdf(
  title: string,
  summary: string,
  meta?: string
): Promise<Buffer> {
  const markdown = summary?.trim()
    ? summary
    : `# Idea Proposal: ${title}\n\n${title}`;

  const html = buildIdeaDocumentHtml({ markdown, meta });
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "idea-pdf-"));
  const htmlPath = path.join(tmpDir, "document.html");
  const pdfPath = path.join(tmpDir, "document.pdf");

  try {
    await writeFile(htmlPath, html, "utf8");
    await runChrome(htmlPath, pdfPath);
    return await readFile(pdfPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}
