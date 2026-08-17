import { splitIdeas } from "@/lib/classifier";
import { getSubmissionsByStatus, saveSplitResult } from "@/lib/sheets";
import { sendPendingAcknowledgmentEmails } from "@/lib/submissionAckEmail";
import { readAutoSplitState, writeAutoSplitState } from "@/lib/autoSplitStore";

const POLL_MS = 20_000;
const FAIL_BACKOFF_MS = 5 * 60_000;

type GlobalWorker = typeof globalThis & {
  __ideaAutoSplitTimer?: NodeJS.Timeout;
  __ideaAutoSplitRunning?: boolean;
  __ideaAutoSplitFailedUntil?: Map<number, number>;
};

const g = globalThis as GlobalWorker;

function failedUntil() {
  if (!g.__ideaAutoSplitFailedUntil) g.__ideaAutoSplitFailedUntil = new Map();
  return g.__ideaAutoSplitFailedUntil;
}

export function ensureAutoSplitWorker() {
  startWorker();
}

export function setAutoSplitEnabled(enabled: boolean) {
  writeAutoSplitState({
    enabled,
    lastError: enabled ? null : readAutoSplitState().lastError,
    currentRow: enabled ? readAutoSplitState().currentRow : null,
    currentName: enabled ? readAutoSplitState().currentName : null,
    currentMessage: enabled ? readAutoSplitState().currentMessage : null,
  });
  startWorker();
}

export function setAckEmailEnabled(ackEmailEnabled: boolean) {
  writeAutoSplitState({ ackEmailEnabled });
  startWorker();
}

function startWorker() {
  if (g.__ideaAutoSplitTimer) return;
  g.__ideaAutoSplitTimer = setInterval(() => {
    void tick();
  }, POLL_MS);
  void tick();
}

function stopWorker() {
  if (g.__ideaAutoSplitTimer) {
    clearInterval(g.__ideaAutoSplitTimer);
    g.__ideaAutoSplitTimer = undefined;
  }
}

async function tick() {
  if (g.__ideaAutoSplitRunning) return;
  g.__ideaAutoSplitRunning = true;

  try {
    if (readAutoSplitState().ackEmailEnabled) {
      await sendPendingAcknowledgmentEmails();
    }

    if (!readAutoSplitState().enabled) {
      const pending = await getSubmissionsByStatus("pending");
      writeAutoSplitState({
        pendingCount: pending.length,
        currentMessage: readAutoSplitState().ackEmailEnabled
          ? "Auto-split is off — thank-you emails on"
          : "Auto-split and thank-you emails are off",
      });
      return;
    }

    const pending = await getSubmissionsByStatus("pending");
    const now = Date.now();
    const ready = pending.filter((row) => (failedUntil().get(row.rowNumber) ?? 0) <= now);
    writeAutoSplitState({ pendingCount: pending.length });

    for (const row of ready) {
      if (!readAutoSplitState().enabled) break;
      writeAutoSplitState({
        currentRow: row.rowNumber,
        currentName: row.name || "Unknown submitter",
        currentMessage: `Splitting ${row.name || "submission"}…`,
        lastError: null,
      });
      const result = await splitIdeas(row, (progress) => {
        writeAutoSplitState({ currentMessage: progress.message });
      });
      await saveSplitResult(row.rowNumber, JSON.stringify(result));
      failedUntil().delete(row.rowNumber);
    }

    const leftover = (await getSubmissionsByStatus("pending")).length;
    writeAutoSplitState({
      lastRunAt: new Date().toISOString(),
      currentRow: null,
      currentName: null,
      currentMessage: leftover ? `${leftover} waiting` : "Watching for new submissions",
      pendingCount: leftover,
      lastError: null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = readAutoSplitState();
    if (current.currentRow) {
      failedUntil().set(current.currentRow, Date.now() + FAIL_BACKOFF_MS);
    }
    writeAutoSplitState({
      lastError: message,
      currentRow: null,
      currentName: null,
      currentMessage: null,
    });
  } finally {
    g.__ideaAutoSplitRunning = false;
  }
}

// Kept for tests or manual shutdown; production keeps the worker running for ack emails.
export { stopWorker };
