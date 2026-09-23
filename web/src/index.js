const WEEK = 7 * 864e5;
const CACHE = { "cache-control": "public, max-age=60" };
// Keys the sensor posts (air-quality-sensor.yaml push_reading). The whitelist is what
// keeps the query param out of the json_extract path.
const SENSORS = ["pm25", "pm10", "pm1", "voc", "nox", "temp", "hum"];

// 5-minute averages, matching the sensor's 60s push: ~2016 points for a week.
// json_extract reads straight out of the blob, so adding a sensor never needs a migration.
const historyQuery = (env, sensor) => env.DB.prepare(`
  SELECT ts / 300000 * 300000 AS ts,
         ROUND(AVG(json_extract(data, ?)), 1) AS v
  FROM readings WHERE ts > ? GROUP BY 1 HAVING v IS NOT NULL ORDER BY 1`)
  .bind(`$.${sensor}`, Date.now() - WEEK);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/ingest") {
      if (req.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`)
        return new Response("unauthorized", { status: 401 });

      const body = await req.json().catch(() => null);
      // HA publishes the string "unavailable" when a sensor drops out; that must not
      // reach the table, or the graph gets a hole that reads as a real zero.
      if (!body || typeof body.pm25 !== "number" || !Number.isFinite(body.pm25))
        return new Response("bad payload: pm25 must be a finite number", { status: 400 });

      const ts = Date.now();
      await env.DB.batch([
        env.DB.prepare("INSERT OR REPLACE INTO readings (ts, data) VALUES (?, ?)")
          .bind(ts, JSON.stringify(body)),
        env.DB.prepare("DELETE FROM readings WHERE ts < ?").bind(ts - WEEK),
      ]);
      return new Response("ok");
    }

    if (url.pathname === "/api/data") {
      const [now, history] = await env.DB.batch([
        env.DB.prepare("SELECT ts, data FROM readings ORDER BY ts DESC LIMIT 1"),
        historyQuery(env, "pm25"),
      ]);
      return Response.json(
        {
          now: now.results.length ? JSON.parse(now.results[0].data) : null,
          updated: now.results[0]?.ts ?? null,
          history: history.results,
        },
        { headers: CACHE },
      );
    }

    if (url.pathname === "/api/history") {
      const sensor = url.searchParams.get("sensor");
      if (!SENSORS.includes(sensor))
        return new Response(`unknown sensor: use one of ${SENSORS.join(", ")}`, { status: 400 });
      const { results } = await historyQuery(env, sensor).all();
      return Response.json(results, { headers: CACHE });
    }

    return new Response("not found", { status: 404 });
  },
};
