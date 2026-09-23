// Chart histories: what gets cached in KV, when it is refreshed, and how a row becomes
// a series. No request or response objects reach this layer.
import { BUCKET, SENSORS, sensorAverages } from "./db.js";

const series = (rows, sensor) =>
  rows.filter((r) => r[sensor] !== null).map((r) => ({ ts: r.ts, v: r[sensor] }));

// The chart behind a button can lag half an hour; the one on screen cannot. So the 5-minute
// cron refreshes pm25 every time and the other six only on the half hour: 288 + 48x6 = 576
// KV writes a day, inside the free 1,000. Driven by the cron's own clock, so the budget no
// longer moves when the sensor's push interval does.
export const sensorsDueAt = (scheduledTime) =>
  new Date(scheduledTime).getUTCMinutes() % 30 === 0 ? SENSORS : ["pm25"];

export const refreshHistories = async (env, scheduledTime) => {
  const rows = await sensorAverages(env);
  return Promise.all(sensorsDueAt(scheduledTime)
    .map((s) => env.KV.put(`h:${s}`, JSON.stringify(series(rows, s)))));
};

// The cron is the only writer, so a miss costs one scan and nothing else — the reader still
// gets a correct chart, and the next refresh fills the key. Writing here instead would make
// KV writes a function of traffic, and a burst of cold reads could spend the daily cap.
export const readHistory = async (env, sensor) => {
  // The two TTLs compose rather than align: an edge that caches just before a refresh serves
  // the old value for a full ttl after it, so worst-case lag is ~10 min, ~35 for secondaries.
  // Invisible on a 7-day chart, and the live reading beside it comes from D1 either way.
  const cached = await env.KV.get(`h:${sensor}`, { type: "json", cacheTtl: BUCKET / 1000 });
  if (cached) return cached;
  return series(await sensorAverages(env), sensor);
};
