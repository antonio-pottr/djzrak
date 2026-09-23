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
// for. json_extract pulls the one sensor the caller asked for.
export const sensorHistory = async (env, sensor) => {
  // Interpolated into the SQL below, so it is checked here too rather than only at the route.
  if (!SENSORS.includes(sensor)) throw new Error(`unknown sensor: ${sensor}`);
  const { results } = await env.DB.prepare(
    `SELECT ts, json_extract(data, '$.${sensor}') AS v
     FROM readings WHERE ts > ? ORDER BY ts`).bind(Date.now() - WEEK).all();
  return results.filter((r) => typeof r.v === "number");
};
