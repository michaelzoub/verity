export function hasSupportedGraderEntrypoint(
  language: "typescript" | "javascript" | "python",
  source: string,
) {
  if (language === "python") {
    return /(?:^|\n)\s*(?:async\s+)?def\s+grade\s*\(\s*[A-Za-z_][A-Za-z0-9_]*(?:\s*:[^,)=]+)?\s*\)/m.test(
      source,
    );
  }

  return /(?:^|\n)\s*export\s+default\s+(?:async\s+)?function(?:\s+grade)?\s*\(\s*[A-Za-z_$][A-Za-z0-9_$]*(?:\s*:[^,)=]+)?\s*\)/m.test(
    source,
  );
}
