// US EPA AQI categories keyed on PM2.5, May 2024 revision breakpoints.
// Same thresholds as the LED lambda in air-quality-sensor.yaml — keep both in sync.
//
// Colours are the AirVisual / IQAir palette: softened variants of the official EPA
// bands (#00e400, #ffff00, #ff7e00, #ff0000, #8f3f97, #7e0023), which are too
// saturated for a page-wide surface. IQAir publishes no style guide and their site
// sits behind a bot challenge, so these come from the widely mirrored palette.
// Each band keeps one background in both themes, the way an IQAir chip behaves, with
// a hue-matched dark ink; test.mjs asserts every pair clears WCAG AA.
// `key` indexes levels.* in public/i18n/*.json — this file owns thresholds and
// colour, the translation files own the wording.
export const CATEGORIES = [
  { max: 9.0, key: "good", bg: "#a8e05f", ink: "#1b3b00" },
  { max: 35.4, key: "moderate", bg: "#fdd74b", ink: "#3d2f00" },
  { max: 55.4, key: "sensitive", bg: "#fe9b57", ink: "#3f1a00" },
  { max: 125.4, key: "unhealthy", bg: "#fe6a69", ink: "#450d0d" },
  { max: 225.4, key: "veryUnhealthy", bg: "#a97abc", ink: "#2b0e35" },
  { max: Infinity, key: "hazardous", bg: "#a87383", ink: "#330a16" },
];

const NO_DATA = { key: "noData", bg: "#e0e0e0", ink: "#37474f" };

export function aqi(pm) {
  if (typeof pm !== "number" || !Number.isFinite(pm)) return NO_DATA;
  return CATEGORIES.find((c) => pm <= c.max);
}

export const ALL_TONES = [...CATEGORIES, NO_DATA];

// [pm low, pm high, AQI low, AQI high] — EPA's 2024 PM2.5 table. The top band of
// CATEGORIES covers two AQI sub-bands (301-400 and 401-500), so the AQI number needs
// its own table rather than reusing the display categories.
const BREAKPOINTS = [
  [0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 400],
  [325.5, 500.4, 401, 500],
];

// The US AQI integer IQAir shows for a PM2.5 reading. Null when there is no reading.
export function usAqi(pm) {
  if (typeof pm !== "number" || !Number.isFinite(pm)) return null;
  // EPA truncates the concentration to one decimal before applying the formula,
  // which is also what closes the gaps between bands (9.05 reads as 9.0, not 9.1).
  const c = Math.trunc(pm * 10) / 10;
  const band = BREAKPOINTS.find(([, hi]) => c <= hi);
  if (!band) return 500; // the scale stops at 500; anything past 500.4 pins there
  const [lo, hi, aqiLo, aqiHi] = band;
  return Math.round(((aqiHi - aqiLo) / (hi - lo)) * (Math.max(c, lo) - lo) + aqiLo);
}
