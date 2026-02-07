export function formatError(code: string, message: string): string {
  return `[${code}] ${message}`;
}

export function printError(code: string, message: string): void {
  console.log(formatError(code, message));
}
