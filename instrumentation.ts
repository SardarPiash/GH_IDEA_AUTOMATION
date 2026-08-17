export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { ensureAutoSplitWorker } = await import("./src/lib/autoSplitWorker");
  ensureAutoSplitWorker();
}
