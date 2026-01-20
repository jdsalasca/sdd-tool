import { classifyIntent } from "../router/intent";

export function runRoute(input: string): void {
  const intent = classifyIntent(input);
  console.log(JSON.stringify(intent, null, 2));
}
