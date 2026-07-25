export type GraderLanguage = "typescript" | "javascript" | "python";

export const MAX_GRADER_BYTES = 256 * 1024;

export function languageFromFilename(name: string): GraderLanguage | undefined {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "ts" ? "typescript" : ext === "js" ? "javascript" : ext === "py" ? "python" : undefined;
}

export function validateGraderSource(source: string, language: GraderLanguage, entrypoint: string) {
  if (!source.trim()) return "Paste code or upload a non-empty source file.";
  if (new TextEncoder().encode(source).byteLength > MAX_GRADER_BYTES) return "Grader source must be 256 KB or smaller.";
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(entrypoint)) return "Entrypoint must be a valid function name.";
  if (language === "python" && !new RegExp(`def\\s+${entrypoint}\\s*\\(`).test(source)) return `No Python function named ${entrypoint} was found.`;
  if (language !== "python" && entrypoint === "default" && !/export\s+default/.test(source)) return "TypeScript and JavaScript default entrypoints must export default.";
  return undefined;
}

export function scoreLabel(score?: string, max?: string, unit?: string) {
  if (!score) return "Not configured";
  return `${score}${max ? ` / ${max}` : ""}${unit ? ` ${unit}` : ""}`;
}
