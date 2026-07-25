/** Boundary for an isolated runtime. Never return grader configuration or hidden fixtures. */
export function normalizeScore(raw: number) { return Math.max(0, Math.min(10000, Math.round(raw))); }
