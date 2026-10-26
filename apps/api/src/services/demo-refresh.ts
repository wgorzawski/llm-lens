import { client } from "../db/index";

// Demo data is seeded once, with timestamps relative to the seed time. Left alone it
// slowly drifts out of every "last N days" view and is eventually deleted by
// retention. This shifts each user's traces forward so their newest trace lands at
// "now", preserving the spacing between traces (charts keep their shape).
export async function refreshDemoTimestamps(): Promise<void> {
  const nowMs = Date.now();
  const { rows } = await client.execute(
    `SELECT user_id, MAX(timestamp) AS latest FROM traces GROUP BY user_id`
  );
  for (const row of rows) {
    const latestMs = Date.parse(String(row["latest"]));
    const shiftSeconds = (nowMs - latestMs) / 1000;
    if (!Number.isFinite(shiftSeconds) || shiftSeconds <= 0) continue;
    await client.execute({
      sql: `UPDATE traces
            SET timestamp = strftime('%Y-%m-%dT%H:%M:%fZ', timestamp, ?)
            WHERE user_id = ? AND julianday(timestamp) IS NOT NULL`,
      args: [`+${shiftSeconds.toFixed(3)} seconds`, row["user_id"] as string],
    });
  }
}
