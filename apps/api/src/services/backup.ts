import { mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { client } from "../db/index";

// Nightly SQLite snapshots. `VACUUM INTO` writes a consistent, compacted copy while the
// API keeps serving, so no cron job or extra tooling is needed on the server.
// Enabled by BACKUP_DIR; BACKUP_KEEP_DAYS (default 14) old snapshots are kept.

const backupDir = process.env["BACKUP_DIR"];
const keepDays = Math.max(1, parseInt(process.env["BACKUP_KEEP_DAYS"] ?? "14", 10) || 14);
const FILE_RE = /^llm-lens-(\d{4}-\d{2}-\d{2})\.db$/;

export const backupsEnabled = Boolean(backupDir);

/** Makes today's snapshot if it doesn't exist yet and prunes old ones. Returns the file made, if any. */
export async function runBackupIfDue(now = new Date()): Promise<string | null> {
  if (!backupDir) return null;
  const dir = path.resolve(backupDir);
  mkdirSync(dir, { recursive: true });

  const day = now.toISOString().slice(0, 10);
  const file = path.join(dir, `llm-lens-${day}.db`);
  let made: string | null = null;
  if (!existsFile(file)) {
    const tmp = `${file}.tmp`;
    if (existsFile(tmp)) unlinkSync(tmp);
    await client.execute({ sql: "VACUUM INTO ?", args: [tmp] });
    // rename only once complete, so a half-written file never looks like a backup
    renameSync(tmp, file);
    made = file;
  }

  const cutoff = new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  for (const name of readdirSync(dir)) {
    const m = FILE_RE.exec(name);
    if (m && m[1]! < cutoff) unlinkSync(path.join(dir, name));
  }
  return made;
}

function existsFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
