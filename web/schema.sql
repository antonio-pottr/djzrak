-- npx wrangler d1 execute air --remote --file schema.sql
--
-- The whole read budget rests on ts being the primary key: DELETE ... WHERE ts < ? runs on
-- every ingest, and sensorAverages() range-scans ts. Without the index both walk the table.
--
-- One JSON blob per push instead of a column per sensor, so adding a sensor is a change to
-- SENSORS in src/db.js and nothing else — json_extract reads whatever keys are present, and
-- a chip that reads NaN omits its key rather than writing a zero.
-- Verbatim from the live `air` database, so recreating it produces the same table.
CREATE TABLE IF NOT EXISTS readings (ts INTEGER PRIMARY KEY, data TEXT);
