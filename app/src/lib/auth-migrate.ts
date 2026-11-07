import { getMigrations } from "better-auth/db/migration";
import { auth } from "@/lib/auth";

export async function runAuthMigrations(): Promise<void> {
  const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);
  if (toBeCreated.length === 0 && toBeAdded.length === 0) return;

  await runMigrations();
  console.log(
    `Better Auth schema updated: ${toBeCreated.length} table(s) created, ${toBeAdded.length} table(s) altered`,
  );
}
