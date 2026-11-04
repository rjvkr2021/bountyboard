import { formatNearAmount, nearToYocto } from "near-api-js";

import { loadEnv } from "./lib/env";
import { accountExists, getBalance } from "./lib/near";

function report(kind: "ok" | "warn" | "error", message: string): void {
  console.log(`[${kind}] ${message}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const errors: string[] = [];

  if (env.NEAR_NETWORK !== "testnet") {
    errors.push(
      `NEAR_NETWORK must be testnet for this milestone, got ${env.NEAR_NETWORK}`,
    );
  }

  if (env.DAO_ACCOUNT === env.BOUNTYBOARD_ACCOUNT) {
    errors.push("DAO_ACCOUNT and BOUNTYBOARD_ACCOUNT must differ");
  }
  if (!env.DAO_ACCOUNT.endsWith(`.${env.DEPLOYER_ACCOUNT}`)) {
    report(
      "warn",
      `${env.DAO_ACCOUNT} is not a subaccount of deployer ${env.DEPLOYER_ACCOUNT}; ` +
        "create it manually before dao:create",
    );
  }
  if (!env.BOUNTYBOARD_ACCOUNT.endsWith(`.${env.DAO_ACCOUNT}`)) {
    errors.push(
      `${env.BOUNTYBOARD_ACCOUNT} must be a subaccount of the DAO ${env.DAO_ACCOUNT}`,
    );
  }

  for (const [label, accountId] of [
    ["deployer", env.DEPLOYER_ACCOUNT],
    ["founder", env.FOUNDER_ACCOUNT],
    ["oracle", env.NEAR_ORACLE_ACCOUNT],
  ] as const) {
    if (await accountExists(env, accountId)) {
      report("ok", `${label} account ${accountId} exists`);
    } else {
      errors.push(`${label} account ${accountId} does not exist`);
    }
  }

  if (await accountExists(env, env.DEPLOYER_ACCOUNT)) {
    const balance = await getBalance(env, env.DEPLOYER_ACCOUNT);
    const minimum = nearToYocto(env.MIN_DEPLOYER_BALANCE_NEAR);
    const formatted = formatNearAmount(balance.toString());
    if (balance < minimum) {
      errors.push(
        `deployer balance ${formatted} NEAR is below the required ` +
          `${env.MIN_DEPLOYER_BALANCE_NEAR} NEAR`,
      );
    } else {
      report("ok", `deployer balance is ${formatted} NEAR`);
    }
  }

  if (errors.length > 0) {
    for (const error of errors) {
      report("error", error);
    }
    process.exitCode = 1;
    return;
  }

  report("ok", "environment preflight passed");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
