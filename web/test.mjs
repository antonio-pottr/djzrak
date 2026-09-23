// node test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { aqi, usAqi, ALL_TONES } from "./public/aqi.js";
import { niceRange } from "./public/scale.js";

const label = (pm) => aqi(pm).key;

assert.equal(label(0), "good");
assert.equal(label(9.0), "good");
assert.equal(label(9.1), "moderate");
assert.equal(label(35.4), "moderate");
assert.equal(label(35.5), "sensitive");
assert.equal(label(55.4), "sensitive");
assert.equal(label(125.4), "unhealthy");
assert.equal(label(225.5), "hazardous");
assert.equal(label(1e6), "hazardous");

// A null from HA, a missing reading, or a fetch that came back empty.
assert.equal(label(null), "noData");
assert.equal(label(undefined), "noData");
assert.equal(label(NaN), "noData");
assert.equal(label("12"), "noData");

// A step of 0, NaN or undefined hangs the gridline loop, so check the whole range,
// including below-zero temperatures and flat series where lo === hi.
for (const [lo, hi] of [[0, 0], [0, 0.4], [0, 12], [0, 37], [0, 999], [0, 1e6],
  [-8, -3], [-3, 4], [18, 18], [99, 104], [35, 90]]) {
  const { step, bottom, top } = niceRange(lo, hi);
  assert.ok(step > 0 && Number.isFinite(step), `step for ${lo}..${hi}: ${step}`);
  assert.ok(bottom <= lo && top >= hi, `${bottom}..${top} must cover ${lo}..${hi}`);
  assert.ok((top - bottom) / step <= 10, `too many gridlines for ${lo}..${hi}`);
}

assert.deepEqual(niceRange(0, 12), { step: 5, bottom: 0, top: 15 });
assert.deepEqual(niceRange(0, 100), { step: 25, bottom: 0, top: 100 });
assert.deepEqual(niceRange(-3, 4), { step: 2, bottom: -4, top: 4 });

// WCAG 2.1 relative luminance and contrast ratio.
const luminance = (hex) => {
  const ch = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

assert.equal(contrast("#ffffff", "#000000").toFixed(0), "21"); // sanity-check the formula

// The hero renders body text on these pairs, so every one must clear WCAG AA (4.5:1).
for (const tone of ALL_TONES) {
  const ratio = contrast(tone.bg, tone.ink);
  assert.ok(ratio >= 4.5, `${tone.key}: ${ratio.toFixed(2)}:1 is below AA`);
}

// Every AQI band boundary, so the number beside the hero matches what IQAir shows.
assert.equal(usAqi(0), 0);
assert.equal(usAqi(9.0), 50);
assert.equal(usAqi(9.1), 51);
assert.equal(usAqi(35.4), 100);
assert.equal(usAqi(35.5), 101);
assert.equal(usAqi(55.4), 150);
assert.equal(usAqi(125.4), 200);
assert.equal(usAqi(225.4), 300);
assert.equal(usAqi(325.4), 400);
assert.equal(usAqi(500.4), 500);
assert.equal(usAqi(9000), 500, "the scale pins at 500");
// Truncation to one decimal is what closes the gap between 9.0 and 9.1.
assert.equal(usAqi(9.05), 50);
assert.equal(usAqi(null), null);
assert.equal(usAqi(NaN), null);
// The AQI band and the colour band must agree on which side of a boundary a value is.
assert.equal(aqi(9.0).key, "good");
assert.ok(usAqi(9.0) <= 50);
assert.equal(aqi(9.1).key, "moderate");
assert.ok(usAqi(9.1) > 50);

// The chart line is HA's Observable10 blue on an ha-card, in both themes.
assert.ok(contrast("#4269d0", "#ffffff") >= 3, "chart line on a light card");
assert.ok(contrast("#97bbf5", "#1c1c1c") >= 3, "chart line on a dark card");
assert.ok(contrast("#5f6368", "#ffffff") >= 4.5, "secondary text on a light card");
assert.ok(contrast("#9b9b9b", "#1c1c1c") >= 4.5, "secondary text on a dark card");

// Translations. A key present in one file and missing from the other renders as
// "undefined" on the page, so compare the full nested key sets rather than eyeballing.
const LANGS = ["hr", "en"];
const strings = Object.fromEntries(LANGS.map((code) =>
  [code, JSON.parse(readFileSync(`./public/i18n/${code}.json`, "utf8"))]));

const paths = (obj, prefix = "") => Object.entries(obj).flatMap(([key, v]) =>
  v && typeof v === "object" ? paths(v, `${prefix}${key}.`) : [`${prefix}${key}`]);

const [first, ...rest] = LANGS;
for (const code of rest) {
  assert.deepEqual(
    paths(strings[code]).sort(), paths(strings[first]).sort(),
    `${code}.json and ${first}.json do not have the same keys`,
  );
}

for (const [code, table] of Object.entries(strings)) {
  // Every category key aqi.js can return needs a translated level name.
  for (const tone of ALL_TONES) {
    assert.ok(table.levels[tone.key], `${code}.json is missing levels.${tone.key}`);
  }
  // Placeholders the page fills in; a typo here silently prints the raw brace.
  assert.match(table.usAqi, /\{value\}/, `${code}.json usAqi needs {value}`);
  assert.match(table.updated, /\{time\}/, `${code}.json updated needs {time}`);
  assert.match(table.apiError, /\{status\}/, `${code}.json apiError needs {status}`);
  assert.match(table.about.open, /\{name\}/, `${code}.json about.open needs {name}`);
  assert.match(table.sections.history, /\{name\}/, `${code}.json sections.history needs {name}`);
  assert.match(table.chart.aria, /\{name\}/, `${code}.json chart.aria needs {name}`);
  assert.match(table.chart.open, /\{name\}/, `${code}.json chart.open needs {name}`);
  assert.ok(table.locale, `${code}.json needs a locale for date formatting`);
  for (const path of paths(table)) {
    const value = path.split(".").reduce((o, k) => o[k], table);
    assert.ok(typeof value === "string" && value.trim(), `${code}.json ${path} is empty`);
  }
}

// The Worker's sensor whitelist and the page's chart buttons must agree — a sensor
// the page offers but the Worker rejects renders a broken chart.
const workerSrc = readFileSync("./src/db.js", "utf8");
const pageSrc = readFileSync("./public/index.html", "utf8");

// Renaming either array should say so, not throw on a null match.
const arrayBody = (src, where, name) => {
  const found = src.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
  assert.ok(found, `${where} no longer declares const ${name} — update this check`);
  return found[1];
};

const workerSensors = [...arrayBody(workerSrc, "src/db.js", "SENSORS").matchAll(/"(\w+)"/g)]
  .map((m) => m[1]);

const pageKeys = (name) =>
  [...arrayBody(pageSrc, "index.html", name).matchAll(/\["(\w+)"/g)].map((m) => m[1]);
// The hero's pm25 chart button is hardcoded in the HTML rather than listed in an array.
const pageSensors = ["pm25", ...pageKeys("PRIMARY"), ...pageKeys("SECONDARY")];

assert.deepEqual(
  pageSensors.slice().sort(), workerSensors.slice().sort(),
  "index.html chart buttons and src/db.js SENSORS do not have the same sensor set",
);

// Two free-tier caps, and the inputs to both live outside this file: the cron sets how many
// times a day the table is scanned, the sensor's push interval sets how many rows each scan
// covers. Read them back rather than restating them, so editing either fails here.
const { sensorsDueAt } = await import("./src/history.js");

const cron = readFileSync("./wrangler.jsonc", "utf8").match(/"crons":\s*\[\s*"([^"]+)"/);
assert.ok(cron, "wrangler.jsonc: no triggers.crons, so scheduled() never runs");
const every = cron[1].match(/^\*\/(\d+) \* \* \* \*$/);
assert.ok(every, `the budget below assumes an every-N-minutes cron, got "${cron[1]}"`);
const STEP = Number(every[1]);

const sensorYaml = readFileSync("../air-quality-sensor.yaml", "utf8");
// The SPS30's pm_2_5 is what fires push_reading, so its update_interval sets the row count.
const sps30 = sensorYaml.slice(sensorYaml.indexOf("platform: sps30"));
const push = sps30.match(/update_interval:\s*(\d+)s/);
assert.ok(push, "air-quality-sensor.yaml: no update_interval under platform: sps30");
const PERIOD = Number(push[1]) * 1000;

let writes = 0;
let scans = 0;
for (let m = 0; m < 24 * 60; m += STEP) {
  writes += sensorsDueAt(Date.UTC(2026, 0, 1, 0, m)).length;
  scans++;
}
const rows = scans * (7 * 864e5 / PERIOD); // every refresh scans the whole week

assert.ok(writes <= 1000,
  `a ${STEP}-minute cron writes ${writes} KV keys a day, over the 1,000 cap`);
assert.ok(rows <= 5e6, `a ${STEP}-minute cron over a ${PERIOD / 1000}s push interval reads `
  + `${(rows / 1e6).toFixed(2)}M D1 rows a day, over 5M`);

// Only the half hour pulls the six sensors that sit behind a chart button.
assert.deepEqual(sensorsDueAt(Date.UTC(2026, 0, 1, 12, 30)).slice().sort(),
  workerSensors.slice().sort());
assert.deepEqual(sensorsDueAt(Date.UTC(2026, 0, 1, 12, 5)), ["pm25"]);

console.log(
  `aqi + scale + contrast + i18n (${LANGS.join(", ")}) + sensor whitelist + kv budget ok`);
