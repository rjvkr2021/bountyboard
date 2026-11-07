import { join } from "node:path";

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.length > 0 ? value : fallback;
}

function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

export interface PlatformConfig {
  rootAccount: string;
  dataFile: string;
  storeDriver: "file" | "postgres";
  platformDatabaseUrl: string;
  platformPgPoolMax: number;
  platformPgSsl: boolean;
  network: "testnet" | "mainnet" | "localnet";
  rpcUrl: string;
  defaultBudgetNear: number;
  defaultDailyCapNear: number;
  bootstrapUntilMaintainers: number;
  near: {
    deployerAccount: string;
    deployerPrivateKey: string;
    oraclePublicKey: string;
    oraclePrivateKey: string;
    boardWasm: string;
    sputnikWasm: string;
    proposalBondNear: string;
    bountyBondNear: string;
    proposalPeriodSecs: number;
    bountyForgivenessSecs: number;
    launchFundingBufferNear: string;
  };
  github: {
    appId: string;
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
  };
  kms: {
    provider: string;
    keyId: string;
  };
  auth: {
    databaseUrl: string;
    baseUrl: string;
    secret: string;
  };
  identity: {
    relinkCooldownSecs: number;
  };
}

export function getPlatformConfig(): PlatformConfig {
  const network = env("NEAR_NETWORK", "testnet") as PlatformConfig["network"];
  const appRoot = process.cwd();

  return {
    rootAccount: env("PLATFORM_ROOT_ACCOUNT", "bountyboard.testnet"),
    dataFile: env("PLATFORM_DATA_FILE", join(appRoot, ".data", "platform.json")),
    storeDriver: env("PLATFORM_STORE", process.env.DATABASE_URL ? "postgres" : "file") as
      | "file"
      | "postgres",
    platformDatabaseUrl: env("PLATFORM_DATABASE_URL", process.env.DATABASE_URL ?? ""),
    platformPgPoolMax: envInt("PLATFORM_PG_POOL_MAX", 5),
    platformPgSsl: env("PLATFORM_PG_SSL", "false") === "true",
    network,
    rpcUrl: env(
      "NEAR_RPC_URL",
      network === "mainnet"
        ? "https://free.rpc.fastnear.com"
        : network === "localnet"
          ? "http://127.0.0.1:3030"
          : "https://rpc.testnet.fastnear.com",
    ),
    defaultBudgetNear: envInt("PLATFORM_DEFAULT_BUDGET_NEAR", 2),
    defaultDailyCapNear: envInt("PLATFORM_DEFAULT_DAILY_CAP_NEAR", 1),
    bootstrapUntilMaintainers: envInt("PLATFORM_BOOTSTRAP_UNTIL_MAINTAINERS", 3),
    near: {
      deployerAccount: env("PLATFORM_DEPLOYER_ACCOUNT", ""),
      deployerPrivateKey: env("PLATFORM_DEPLOYER_PRIVATE_KEY", ""),
      oraclePublicKey: env("PLATFORM_ORACLE_PUBLIC_KEY", ""),
      oraclePrivateKey: env("PLATFORM_ORACLE_PRIVATE_KEY", ""),
      boardWasm: env("PLATFORM_BOARD_WASM", join(appRoot, "wasm", "bounty_board.wasm")),
      sputnikWasm: env("PLATFORM_SPUTNIK_WASM", join(appRoot, "wasm", "sputnikdao2.wasm")),
      proposalBondNear: env("PLATFORM_DAO_PROPOSAL_BOND_NEAR", "1"),
      bountyBondNear: env("PLATFORM_DAO_BOUNTY_BOND_NEAR", "1"),
      proposalPeriodSecs: envInt("PLATFORM_DAO_PROPOSAL_PERIOD_SECS", 604_800),
      bountyForgivenessSecs: envInt("PLATFORM_DAO_BOUNTY_FORGIVENESS_SECS", 86_400),
      launchFundingBufferNear: env("PLATFORM_LAUNCH_FUNDING_BUFFER_NEAR", "0.5"),
    },
    github: {
      appId: env("GITHUB_APP_ID", ""),
      clientId: env("GITHUB_CLIENT_ID", ""),
      clientSecret: env("GITHUB_CLIENT_SECRET", ""),
      webhookSecret: env("GITHUB_WEBHOOK_SECRET", ""),
    },
    kms: {
      provider: env("PLATFORM_KMS_PROVIDER", "local"),
      keyId: env("PLATFORM_KMS_KEY_ID", ""),
    },
    auth: {
      databaseUrl: env("DATABASE_URL", ""),
      baseUrl: env("BETTER_AUTH_URL", ""),
      secret: env("BETTER_AUTH_SECRET", ""),
    },
    identity: {
      relinkCooldownSecs: envInt("PLATFORM_IDENTITY_RELINK_COOLDOWN_SECS", 86_400),
    },
  };
}

export function missingProductionInputs(config: PlatformConfig = getPlatformConfig()): string[] {
  const missing: string[] = [];
  if (!config.github.clientId) missing.push("GITHUB_CLIENT_ID");
  if (!config.github.clientSecret) missing.push("GITHUB_CLIENT_SECRET");
  if (!config.github.appId) missing.push("GITHUB_APP_ID");
  if (!config.github.webhookSecret) missing.push("GITHUB_WEBHOOK_SECRET");
  if (!config.near.deployerAccount) missing.push("PLATFORM_DEPLOYER_ACCOUNT");
  if (!config.near.deployerPrivateKey) missing.push("PLATFORM_DEPLOYER_PRIVATE_KEY");
  if (!config.near.oraclePublicKey) missing.push("PLATFORM_ORACLE_PUBLIC_KEY");
  if (!config.near.oraclePrivateKey) missing.push("PLATFORM_ORACLE_PRIVATE_KEY");
  if (!config.auth.databaseUrl) missing.push("DATABASE_URL");
  if (config.storeDriver === "postgres" && !config.platformDatabaseUrl) {
    missing.push("PLATFORM_DATABASE_URL");
  }
  if (config.auth.secret.length < 32) missing.push("BETTER_AUTH_SECRET");
  if (!config.auth.baseUrl) missing.push("BETTER_AUTH_URL");
  return missing;
}
