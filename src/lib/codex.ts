import { execFile } from "child_process";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
export type CodexRunOptions = { schema?: object; timeoutMs?: number };

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

export async function runCodex(prompt: string, options: CodexRunOptions = {}): Promise<string> {
  if (!prompt.trim()) throw new Error("Codex input must not be empty");
  const timeoutMs = options.timeoutMs ?? Number(process.env.CODEX_TIMEOUT_MS || 300_000);
  const workdir = process.env.CODEX_WORKDIR || process.cwd();
  const codexBin = process.env.CODEX_BIN || "codex";
  const tempDir = await mkdtemp(path.join(tmpdir(), "idea-codex-"));
  const promptPath = path.join(tempDir, "prompt.txt");
  const outputPath = path.join(tempDir, "response.txt");
  const logPath = path.join(tempDir, "codex.log");
  const schemaPath = path.join(tempDir, "schema.json");
  const session = `idea-codex-${path.basename(tempDir)}`;

  try {
    await writeFile(promptPath, prompt, { mode: 0o600 });
    if (options.schema) await writeFile(schemaPath, JSON.stringify(options.schema), { mode: 0o600 });
    const codexArgs = [
      shellQuote(codexBin), "exec", "--ephemeral", "--sandbox", "read-only",
      "--skip-git-repo-check", "-C", shellQuote(workdir),
      "--output-last-message", shellQuote(outputPath),
    ];
    if (process.env.CODEX_MODEL) codexArgs.push("--model", shellQuote(process.env.CODEX_MODEL));
    if (options.schema) codexArgs.push("--output-schema", shellQuote(schemaPath));
    codexArgs.push("-", "<", shellQuote(promptPath), ">", shellQuote(logPath), "2>&1");
    await execFileAsync("tmux", ["new-session", "-d", "-s", session, codexArgs.join(" ")]);

    const deadline = Date.now() + timeoutMs;
    while (await sessionExists(session)) {
      if (Date.now() >= deadline) {
        await execFileAsync("tmux", ["kill-session", "-t", session]).catch(() => undefined);
        throw new Error(`Codex timed out after ${timeoutMs}ms`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    try {
      return (await readFile(outputPath, "utf8")).trim();
    } catch {
      const log = await readFile(logPath, "utf8").catch(() => "No Codex log available");
      throw new Error(`Codex did not return a response: ${log.slice(-2000)}`);
    }
  } finally {
    await execFileAsync("tmux", ["kill-session", "-t", session]).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}
