// Every SQL string and every D1 call lives here. Nothing above this layer touches env.DB.
export const WEEK = 7 * 864e5;
export const BUCKET = 3e5;
// Keys the sensor posts (air-quality-sensor.yaml push_reading).
export const SENSORS = ["pm25", "pm10", "pm1", "voc", "nox", "temp", "hum"];

// Keyed on the bucket, so the ~5 pushes that land in one 5-minute window overwrite each other
// and the table holds one row per bucket. No boundary arithmetic, nothing to drift.
export const insertReading = (env, ts, body) => env.DB.batch([
  env.DB.prepare("INSERT OR REPLACE INTO readings (ts, data, seen) VALUES (?, ?, ?)")
    .bind(Math.floor(ts / BUCKET) * BUCKET, JSON.stringify(body), ts),
  env.DB.prepare("DELETE FROM readings WHERE ts < ?").bind(ts - WEEK),
]);

// The newest bucket is rewritten by every push, so this is never more than one push stale.
// COALESCE covers rows written before `seen` existed.
export const latestReading = async (env) => {
  const row = await env.DB.prepare(
    "SELECT COALESCE(seen, ts) AS ts, data FROM readings ORDER BY ts DESC LIMIT 1").first();
  return { now: row ? JSON.parse(row.data) : null, updated: row?.ts ?? null };
};

// A plain range scan over the primary key: ~2,016 rows for a week, and D1 bills exactly that.
// The rows are already one per bucket, so there is nothing to average and no GROUP BY to pay
// for. Every sensor comes out of the same scan, one json_extract column each, so the page's
// sparklines and 24-hour ranges cost no more rows than a single chart did.
//
// Columnar ({ ts: [...], pm25: [...], ... }) because a week of seven sensors as {ts, v}
// objects is ~400 KB of repeated keys. A missing reading is null at its index.
export const weekHistory = async (env) => {
  // SENSORS is a fixed whitelist, so interpolating it into the SQL is safe.
  const columns = SENSORS.map((s) => `ROUND(json_extract(data, '$.${s}'), 2) AS ${s}`).join(", ");
  const { results } = await env.DB.prepare(
    `SELECT ts, ${columns} FROM readings WHERE ts > ? ORDER BY ts`).bind(Date.now() - WEEK).all();
  return Object.fromEntries(["ts", ...SENSORS].map((key) => [key, results.map((r) => r[key])]));
};
