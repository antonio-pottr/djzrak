// Routing only: parse the request, call a service, shape the response.
import { SENSORS, insertReading, latestReading } from "./db.js";
import { readHistory, refreshHistories } from "./history.js";

// A refresh is the only way to get new data, so it must never come from the browser's
// cache. Edge-side caching is unaffected: KV keeps its own cacheTtl.
const CACHE = { "cache-control": "no-store" };

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

      await insertReading(env, Date.now(), body);
      return new Response("ok");
    }

    if (url.pathname === "/api/data") {
      const [latest, history] = await Promise.all([
        latestReading(env),
        readHistory(env, "pm25"),
      ]);
      return Response.json({ ...latest, history }, { headers: CACHE });
    }

    if (url.pathname === "/api/history") {
      const sensor = url.searchParams.get("sensor");
      if (!SENSORS.includes(sensor))
        return new Response(`unknown sensor: use one of ${SENSORS.join(", ")}`, { status: 400 });
      return Response.json(await readHistory(env, sensor), { headers: CACHE });
    }

    return new Response("not found", { status: 404 });
  },

  // triggers.crons in wrangler.jsonc. Rebuilding here rather than on ingest keeps the write
  // budget tied to the schedule instead of to how often the sensor happens to push.
  async scheduled(event, env) {
    await refreshHistories(env, event.scheduledTime);
  },
};
