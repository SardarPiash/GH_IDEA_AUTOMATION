import { execFile } from "child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export type CursorRunOptions = { timeoutMs?: number; model?: string };

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

async function sessionExists(name: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", name]);
    return true;
  } catch {
    return false;
  }
}

export function cursorModelCandidates(explicit?: string): string[] {
  const preferred = explicit?.trim() || process.env.CURSOR_MODEL?.trim();
  const defaults = ["auto", "composer-2.5", "gpt-5.4"];
  const seen = new Set<string>();
  const models: string[] = [];
  for (const id of [preferred, ...defaults]) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    models.push(id);
  }
  return models;
}

export function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

async function runCursorOnce(prompt: string, model: string, timeoutMs: number): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing CURSOR_API_KEY in .env.local");

  const bin = process.env.CURSOR_BIN?.trim() || "cursor-agent";
  const tempDir = await mkdtemp(path.join(tmpdir(), "idea-cursor-"));
  const workspace = path.join(tempDir, "workspace");
  const promptPath = path.join(tempDir, "prompt.txt");
  const outputPath = path.join(tempDir, "response.txt");
  const logPath = path.join(tempDir, "cursor.log");
  const session = `idea-cursor-${path.basename(tempDir)}`;

  try {
    await mkdir(workspace, { recursive: true });
    await writeFile(promptPath, prompt, { mode: 0o600 });

    const cmd = [
      `CURSOR_API_KEY=${shellQuote(apiKey)}`,
      shellQuote(bin),
      "--print",
      "--output-format",
      "text",
      "--mode",
      "ask",
      "--sandbox",
      process.env.CURSOR_SANDBOX?.trim() || "disabled",
      "--trust",
      "--workspace",
      shellQuote(workspace),
      "--model",
      shellQuote(model),
      `"$(cat ${shellQuote(promptPath)})"`,
      ">",
      shellQuote(outputPath),
      "2>",
      shellQuote(logPath),
    ].join(" ");

    await execFileAsync("tmux", ["new-session", "-d", "-s", session, cmd]);

    const deadline = Date.now() + timeoutMs;
    while (await sessionExists(session)) {
      if (Date.now() >= deadline) {
        await execFileAsync("tmux", ["kill-session", "-t", session]).catch(() => undefined);
        throw new Error(`Cursor timed out after ${timeoutMs}ms (${model})`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    const output = await readFile(outputPath, "utf8").catch(() => "");
    if (output.trim()) return output.trim();
    const log = (await readFile(logPath, "utf8").catch(() => "")).replace(/\x1b\[[0-9;]*m/g, "").trim();
    throw new Error(
      `Cursor did not return a response (${model}): ${log.slice(-1500) || "No Cursor log available"}`
    );
  } finally {
    await execFileAsync("tmux", ["kill-session", "-t", session]).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

export async function runCursor(
  prompt: string,
  options: CursorRunOptions = {}
): Promise<{ output: string; model: string }> {
  if (!prompt.trim()) throw new Error("Cursor input must not be empty");
  const timeoutMs = options.timeoutMs ?? Number(process.env.CURSOR_TIMEOUT_MS || 300_000);
  const models = cursorModelCandidates(options.model);
  const errors: string[] = [];

  for (const model of models) {
    try {
      const output = await runCursorOnce(prompt, model, timeoutMs);
      return { output, model };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      errors.push(`${model}: ${reason}`);
      console.error(`Cursor model ${model} failed:`, err);
      if (/sandbox mode|missing cursor_api_key|not authenticated|unauthorized/i.test(reason)) {
        break;
      }
    }
  }

  throw new Error(`Cursor failed on all models. ${errors.join(" | ")}`);
}
