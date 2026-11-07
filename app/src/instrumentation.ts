export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { runAuthMigrations } = await import("@/lib/auth-migrate");
    await runAuthMigrations();
    const { runPlatformMigrations } = await import("@/lib/platform/store-migrate");
    await runPlatformMigrations();
  } catch (error) {
    console.error("Could not migrate the Better Auth database schema:", error);
    throw error;
  }
}
