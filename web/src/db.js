// Every SQL string and every D1 call lives here. Nothing above this layer touches env.DB.
const WEEK = 7 * 864e5;
export const BUCKET = 3e5;
// Keys the sensor posts (air-quality-sensor.yaml push_reading). The whitelist is what
// keeps a query param out of the json_extract path in sensorAverages.
export const SENSORS = ["pm25", "pm10", "pm1", "voc", "nox", "temp", "hum"];

export const insertReading = (env, ts, body) => env.DB.batch([
  env.DB.prepare("INSERT OR REPLACE INTO readings (ts, data) VALUES (?, ?)")
    .bind(ts, JSON.stringify(body)),
  env.DB.prepare("DELETE FROM readings WHERE ts < ?").bind(ts - WEEK),
]);

// One row, so this stays cheap enough to run on every request and keep "updated" honest.
export const latestReading = async (env) => {
  const row = await env.DB.prepare("SELECT ts, data FROM readings ORDER BY ts DESC LIMIT 1")
    .first();
  return { now: row ? JSON.parse(row.data) : null, updated: row?.ts ?? null };
};

// 5-minute averages, matching the sensor's 60s push: ~2016 points for a week.
// json_extract reads straight out of the blob, so adding a sensor never needs a migration.
// All seven sensors come out of ONE scan: a scan per sensor at the refresh cadence would
// read ~5.8M D1 rows a day, past the free tier's 5M. SENSORS is a source constant, so
// interpolating it here carries no user input into the SQL.
export const sensorAverages = async (env) => {
  const { results } = await env.DB.prepare(`
    SELECT ts / ${BUCKET} * ${BUCKET} AS ts,
           ${SENSORS.map((s) => `ROUND(AVG(json_extract(data, '$.${s}')), 1) AS "${s}"`).join(", ")}
    FROM readings WHERE ts > ? GROUP BY 1 ORDER BY 1`)
    .bind(Date.now() - WEEK).all();
  return results;
};
