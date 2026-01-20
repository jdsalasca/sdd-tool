export function formatList(input: string): string {
  const items = input
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (items.length === 0) {
    return "- N/A";
  }
  return items.map((item) => `- ${item}`).join("\n");
}
