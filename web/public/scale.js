// Y-axis scale: ~4 gridlines at a round interval, snapped to a 1/2/2.5/5 × 10ⁿ step.
// `step` must never come back 0, NaN or undefined — the gridline loop increments by it.
export function niceMax(max) {
  const raw = Math.max(max, 1) / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  // raw < 10 * mag always holds, so the last candidate is a guaranteed match.
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  return { step, top: Math.ceil(max / step) * step };
}
