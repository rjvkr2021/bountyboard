import { JsonRpcProvider } from "near-api-js";
import type { PlatformConfig } from "./config";

export async function nearAccountExists(
  config: PlatformConfig,
  accountId: string,
): Promise<boolean> {
  const provider = new JsonRpcProvider({ url: config.rpcUrl });
  try {
    await provider.viewAccount({ accountId });
    return true;
  } catch {
    return false;
  }
}
