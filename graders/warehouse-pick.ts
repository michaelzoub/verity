export default function grade(solution: unknown): number {
  if (!solution || typeof solution !== "object") return 0;
  const value = solution as { accuracy?: number; pickTimeSeconds?: number };
  if (typeof value.accuracy !== "number" || typeof value.pickTimeSeconds !== "number") return 0;
  return Math.max(0, Math.min(10000, Math.round(value.accuracy * 7000 + Math.max(0, 1 - value.pickTimeSeconds / 600) * 3000)));
}
