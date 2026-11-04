import "dotenv/config";
import { z } from "zod";

const ACCOUNT_ID_PATTERN = /^(?=.{2,64}$)[a-z0-9][a-z0-9._-]*[a-z0-9]$/;

const accountId = z
  .string()
  .regex(ACCOUNT_ID_PATTERN, "must be a valid NEAR account id");

const optionalSecret = z.string().min(1).optional();

export const EnvSchema = z
  .object({
    NEAR_NETWORK: z.enum(["testnet", "mainnet", "localnet"]).default("testnet"),
    NEAR_RPC_URL: z.string().url().optional(),
    DAO_ACCOUNT: accountId,
    BOUNTYBOARD_ACCOUNT: accountId,
    FOUNDER_ACCOUNT: accountId,
    NEAR_ORACLE_ACCOUNT: accountId,
    NEAR_ORACLE_PRIVATE_KEY: optionalSecret,
    DEPLOYER_ACCOUNT: accountId,
    DEPLOYER_PRIVATE_KEY: optionalSecret,
    GITHUB_REPO: z.string().optional(),
    GITHUB_OWNER: z.string().optional(),
    GITHUB_REPO_NAME: z.string().optional(),
    TREASURY_BUDGET_NEAR: z.coerce.number().positive().default(100),
    BOUNTYBOARD_RESERVE_NEAR: z.coerce.number().nonnegative().default(10),
    DAO_PROPOSAL_BOND_NEAR: z.coerce.number().nonnegative().default(1),
    DAO_BOUNTY_BOND_NEAR: z.coerce.number().nonnegative().default(1),
    DAO_PROPOSAL_PERIOD_SECS: z.coerce.number().int().positive().default(604800),
    DAO_BOUNTY_FORGIVENESS_SECS: z.coerce.number().int().positive().default(86400),
  })
  .passthrough();

export type Env = z.infer<typeof EnvSchema>;

export function parseEnv(source: NodeJS.ProcessEnv | Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment:\n${details}`);
  }
  return result.data;
}

export function rpcUrl(env: Env): string {
  if (env.NEAR_RPC_URL) {
    return env.NEAR_RPC_URL;
  }
  if (env.NEAR_NETWORK === "localnet") {
    return "http://127.0.0.1:3030";
  }
  return `https://rpc.${env.NEAR_NETWORK}.near.org`;
}

function maskSecret(value: string | undefined): string {
  if (!value) {
    return "(unset)";
  }
  if (value.length <= 8) {
    return "********";
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function summarizeEnv(env: Env): string {
  return [
    `NEAR_NETWORK=${env.NEAR_NETWORK}`,
    `NEAR_RPC_URL=${rpcUrl(env)}`,
    `DAO_ACCOUNT=${env.DAO_ACCOUNT}`,
    `BOUNTYBOARD_ACCOUNT=${env.BOUNTYBOARD_ACCOUNT}`,
    `FOUNDER_ACCOUNT=${env.FOUNDER_ACCOUNT}`,
    `NEAR_ORACLE_ACCOUNT=${env.NEAR_ORACLE_ACCOUNT}`,
    `NEAR_ORACLE_PRIVATE_KEY=${maskSecret(env.NEAR_ORACLE_PRIVATE_KEY)}`,
    `DEPLOYER_ACCOUNT=${env.DEPLOYER_ACCOUNT}`,
    `DEPLOYER_PRIVATE_KEY=${maskSecret(env.DEPLOYER_PRIVATE_KEY)}`,
    `TREASURY_BUDGET_NEAR=${env.TREASURY_BUDGET_NEAR}`,
    `BOUNTYBOARD_RESERVE_NEAR=${env.BOUNTYBOARD_RESERVE_NEAR}`,
    `DAO_PROPOSAL_BOND_NEAR=${env.DAO_PROPOSAL_BOND_NEAR}`,
    `DAO_BOUNTY_BOND_NEAR=${env.DAO_BOUNTY_BOND_NEAR}`,
    `DAO_PROPOSAL_PERIOD_SECS=${env.DAO_PROPOSAL_PERIOD_SECS}`,
    `DAO_BOUNTY_FORGIVENESS_SECS=${env.DAO_BOUNTY_FORGIVENESS_SECS}`,
  ].join("\n");
}

export function loadEnv(options: { silent?: boolean } = {}): Env {
  const env = parseEnv(process.env);
  if (!options.silent) {
    console.log(`Environment:\n${summarizeEnv(env)}`);
  }
  return env;
}

export function requireSecret(
  env: Env,
  key: "NEAR_ORACLE_PRIVATE_KEY" | "DEPLOYER_PRIVATE_KEY",
): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required for this command`);
  }
  return value;
}
