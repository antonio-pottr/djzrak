-- npx wrangler d1 execute air --remote --file schema.sql
--
-- ts is the 5-minute bucket the reading fell in, not the moment it arrived, and it is the
-- primary key. Every push INSERT OR REPLACEs its own bucket, so the table collapses to one
-- row per 5 minutes without the Worker tracking boundaries, and the newest row still holds a
-- reading no older than one push. That is what lets the chart query be a plain range scan:
-- grouping on an expression like ts/300000*300000 makes SQLite build a temp b-tree, and D1
-- bills every row written to it and read back — twice the rows, for the same answer.
--
-- seen is when that reading was actually taken, so the page can say "Updated 14:07" while
-- the row it came from is keyed 14:05.
--
-- One JSON blob rather than a column per sensor: adding a sensor is a change to SENSORS in
-- src/db.js and nothing else, and a chip reading NaN omits its key instead of writing a zero.
CREATE TABLE IF NOT EXISTS readings (
  ts   INTEGER PRIMARY KEY,
  data TEXT,
  seen INTEGER
);

-- Already-deployed databases have the table without `seen`; this adds it. Rows written
-- before it existed keep NULL, which latestReading() reads through with COALESCE.
-- ALTER TABLE readings ADD COLUMN seen INTEGER;
