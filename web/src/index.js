// Routing only: parse the request, call db.js, shape the response.
import { SENSORS, insertReading, latestReading, sensorHistory } from "./db.js";

// A refresh is the only way to get new data, so it must never come from the browser's cache.
const CACHE = { "cache-control": "no-store" };

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (req.method === "POST" && url.pathname === "/ingest") {
      if (req.headers.get("authorization") !== `Bearer ${env.INGEST_TOKEN}`)
        return new Response("unauthorized", { status: 401 });

      const body = await req.json().catch(() => null);
      // A dead chip omits its key, which json_extract reads as absent. A payload with no
      // usable pm25 at all is rejected outright, or the graph gets a hole reading as a zero.
      if (!body || typeof body.pm25 !== "number" || !Number.isFinite(body.pm25))
        return new Response("bad payload: pm25 must be a finite number", { status: 400 });

      await insertReading(env, Date.now(), body);
      return new Response("ok");
    }

    if (url.pathname === "/api/data") {
      const [latest, history] = await Promise.all([
        latestReading(env),
        sensorHistory(env, "pm25"),
      ]);
      return Response.json({ ...latest, history }, { headers: CACHE });
    }

    if (url.pathname === "/api/history") {
      const sensor = url.searchParams.get("sensor");
      if (!SENSORS.includes(sensor))
        return new Response(`unknown sensor: use one of ${SENSORS.join(", ")}`, { status: 400 });
      return Response.json(await sensorHistory(env, sensor), { headers: CACHE });
    }

    return new Response("not found", { status: 404 });
  },
};
