import { existsSync, readFileSync } from "node:fs";
import { Pool } from "pg";
import { getPlatformConfig } from "./config";
import { emptyData, normalizePlatformData } from "./store";
import { ensurePlatformSchema } from "./store-postgres";

const STATE_ID = "default";

function isEmpty(data: ReturnType<typeof emptyData>): boolean {
  return (
    Object.keys(data.repositories).length === 0 &&
    Object.keys(data.deployments).length === 0 &&
    Object.keys(data.boards).length === 0 &&
    Object.keys(data.issues).length === 0 &&
    Object.keys(data.identities).length === 0 &&
    data.events.length === 0
  );
}

export async function runPlatformMigrations(): Promise<void> {
  const config = getPlatformConfig();
  if (config.storeDriver !== "postgres") return;
  if (!config.platformDatabaseUrl) throw new Error("PLATFORM_DATABASE_URL is required");

  const pool = new Pool({
    connectionString: config.platformDatabaseUrl,
    max: 1,
    ...(config.platformPgSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  try {
    await ensurePlatformSchema(pool);
    const current = await pool.query<{ data: ReturnType<typeof emptyData> }>(
      "select data from platform_state where id = $1",
      [STATE_ID],
    );
    const data = normalizePlatformData(current.rows[0].data);
    if (!isEmpty(data) || !existsSync(config.dataFile)) return;

    const parsed = JSON.parse(readFileSync(config.dataFile, "utf8")) as ReturnType<
      typeof emptyData
    > & { users?: unknown };
    const imported = normalizePlatformData(parsed);
    if (isEmpty(imported)) return;
    await pool.query(
      "update platform_state set data = $1, updated_at = now() where id = $2",
      [JSON.stringify(imported), STATE_ID],
    );
    console.log(`Imported platform state from ${config.dataFile} into Postgres`);
  } finally {
    await pool.end();
  }
}
