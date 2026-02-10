export function formatList(input: string): string {
  const items = parseList(input);

  if (items.length === 0) {
    return "- N/A";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

export function parseList(input: string): string[] {
  return String(input || "")
    .split(/[\n,;|]+/g)
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter((item) => item.length > 0);
}
