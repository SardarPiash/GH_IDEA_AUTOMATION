import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import path from "path";

export type AutoSplitState = {
  enabled: boolean;
  ackEmailEnabled: boolean;
  lastRunAt: string | null;
  lastError: string | null;
  currentRow: number | null;
  currentName: string | null;
  currentMessage: string | null;
  pendingCount: number;
};

const FILE = path.resolve(
  process.env.AUTO_SPLIT_STATE_PATH?.trim() ||
    path.join(process.cwd(), ".auto-split.json")
);

const DEFAULT_STATE: AutoSplitState = {
  enabled: false,
  ackEmailEnabled: true,
  lastRunAt: null,
  lastError: null,
  currentRow: null,
  currentName: null,
  currentMessage: null,
  pendingCount: 0,
};

export function readAutoSplitState(): AutoSplitState {
  try {
    if (!existsSync(FILE)) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(readFileSync(FILE, "utf8")) as Partial<AutoSplitState>;
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function writeAutoSplitState(patch: Partial<AutoSplitState>): AutoSplitState {
  const next = { ...readAutoSplitState(), ...patch };
  const tmp = `${FILE}.${process.pid}.tmp`;
  mkdirSync(path.dirname(FILE), { recursive: true });
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  renameSync(tmp, FILE);
  return next;
}
