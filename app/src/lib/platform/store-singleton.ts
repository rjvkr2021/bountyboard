import { Pool } from "pg";
import { getPlatformConfig } from "./config";
import { FilePlatformStore } from "./store";
import type { PlatformStore } from "./store-api";
import { PostgresPlatformStore } from "./store-postgres";

let pool: Pool | null = null;

function getPlatformPool(connectionString: string, max: number, ssl: boolean): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString,
      max,
      ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}),
    });
  }
  return pool;
}

export async function getPlatformStore(): Promise<PlatformStore> {
  const config = getPlatformConfig();
  if (config.storeDriver === "postgres") {
    const platformPool = getPlatformPool(
      config.platformDatabaseUrl,
      config.platformPgPoolMax,
      config.platformPgSsl,
    );
    return PostgresPlatformStore.create(platformPool);
  }
  return new FilePlatformStore(config.dataFile);
}

export function getPlatformPoolForJobs(): Pool | null {
  if (!pool) return null;
  return pool;
}

export function resetPlatformStoreForTests(): void {
  // Kept for compatibility with callers that used the old cached singleton.
}
