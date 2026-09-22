const WEEK = 7 * 864e5;

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
        env.DB.prepare("SELECT data FROM readings ORDER BY ts DESC LIMIT 1"),
        // Hourly averages: 168 points for a week. json_extract reads straight out of
        // the blob, so adding a sensor never needs a migration.
        env.DB.prepare(`
          SELECT ts / 3600000 * 3600000 AS h,
                 ROUND(AVG(json_extract(data, '$.pm25')), 1) AS pm25
          FROM readings WHERE ts > ? GROUP BY h ORDER BY h`).bind(Date.now() - WEEK),
      ]);
      return Response.json(
        {
          now: now.results.length ? JSON.parse(now.results[0].data) : null,
          history: history.results,
        },
        { headers: { "cache-control": "public, max-age=60" } },
      );
    }

    return new Response("not found", { status: 404 });
  },
};
