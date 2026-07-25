import { createHash } from "node:crypto";
export const sha256Hex = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const canonicalizeSource = (graderSource: string) => graderSource.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim() + "\n";
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value);
};
/** Converts a decimal representation to an exact Solidity integer. */
export function parseScaledScore(value: string | number, scale: number): bigint {
  if (!Number.isSafeInteger(scale) || scale <= 0) throw new Error("invalid_score_scale");
  const text = String(value); const m = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error("invalid_score");
  const fraction = m[2] ?? ""; const decimals = String(scale).length - 1;
  if (10 ** decimals !== scale || fraction.length > decimals) throw new Error("score_not_representable_at_scale");
  const scaled = BigInt(m[1]) * BigInt(scale) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (scaled > (1n << 256n) - 1n) throw new Error("score_overflow");
  return scaled;
}
export const commitment = (source: string, language: string, runtimeVersion: string, entrypoint: string, config: unknown = {}) => `0x${sha256Hex(new TextEncoder().encode(`${canonicalizeSource(source)}${language}\n${runtimeVersion}\n${entrypoint}\n${canonicalJson(config)}\n`))}`;
