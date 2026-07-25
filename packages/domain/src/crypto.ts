import { createHash } from "node:crypto";
export const sha256Hex = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
export const canonicalizeSource = (graderSource: string) => graderSource.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim() + "\n";
/** Hash the exact canonical bytes persisted by the API, including sandbox config. */
export const commitment = (graderSource: string, sandboxConfig: unknown = {}) => `0x${sha256Hex(new TextEncoder().encode(`${canonicalizeSource(graderSource)}${JSON.stringify(sandboxConfig)}\n`))}`;
