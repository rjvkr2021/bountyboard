import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { Pool } from "pg";

const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const buildOnlySecret = "bountyboard-build-only-secret-not-valid-at-runtime";
const secret = process.env.BETTER_AUTH_SECRET || (isBuild ? buildOnlySecret : undefined);
const baseURL =
  process.env.BETTER_AUTH_URL || (isBuild ? "http://localhost:3000" : undefined);
const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const githubClientId = process.env.GITHUB_CLIENT_ID ?? "";
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET ?? "";
const githubConfigured = Boolean(githubClientId && githubClientSecret);

if (!isBuild) {
  const missing = [
    !process.env.DATABASE_URL ? "DATABASE_URL" : null,
    !process.env.BETTER_AUTH_SECRET ? "BETTER_AUTH_SECRET" : null,
    !process.env.BETTER_AUTH_URL ? "BETTER_AUTH_URL" : null,
  ].filter((name): name is string => name !== null);
  if (missing.length > 0) {
    throw new Error(`Missing required authentication environment variables: ${missing.join(", ")}`);
  }
  if ((process.env.BETTER_AUTH_SECRET?.length ?? 0) < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters");
  }
}

export const auth = betterAuth({
  database: new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
  }),
  ...(secret ? { secret } : {}),
  ...(baseURL ? { baseURL } : {}),
  ...(trustedOrigins && trustedOrigins.length > 0 ? { trustedOrigins } : {}),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  ...(githubConfigured
    ? {
        socialProviders: {
          github: {
            clientId: githubClientId,
            clientSecret: githubClientSecret,
            scope: ["public_repo"],
          },
        },
      }
    : {}),
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: true,
      trustedProviders: ["github"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  ...(isBuild ? { advanced: { database: { validateSchema: false } } } : {}),
  plugins: [nextCookies()],
});
