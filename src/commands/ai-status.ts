import { getFlags } from "../context/flags";
import { listProviders, resolveProvider } from "../providers";
import { printError } from "../errors";

export function runAiStatus(): void {
  const requested = getFlags().provider ?? "gemini";
  const resolution = resolveProvider(requested);
  if (!resolution.ok) {
    if (resolution.reason === "invalid") {
      printError("SDD-1506", `Invalid provider '${requested}'. ${resolution.details}`);
      return;
    }
    printError("SDD-1504", resolution.details);
    for (const provider of listProviders()) {
      const status = provider.version();
      console.log(`${provider.label}: ${status.ok ? status.output : `unavailable (${status.error})`}`);
    }
    return;
  }
  const activeStatus = resolution.provider.version();
  console.log(`Provider selected: ${resolution.provider.id}`);
  console.log(`${resolution.provider.label} available: ${activeStatus.output}`);
}
