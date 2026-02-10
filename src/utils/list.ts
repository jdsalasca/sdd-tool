export function formatList(input: string): string {
  const items = parseList(input);

  if (items.length === 0) {
    return "- N/A";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

export function parseList(input: string): string[] {
  const source = String(input || "");
  const separator = /[\n;|]+/.test(source) ? /[\n;|]+/g : /,/g;
  return source
    .split(separator)
    .map((item) => item.replace(/^\s*[-*]\s*/, "").trim())
    .filter((item) => item.length > 0);
}
