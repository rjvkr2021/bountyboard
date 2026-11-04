import { formatNearAmount, nearToYocto } from "near-api-js";

import { loadEnv, requireSecret } from "./lib/env";
import { callRaw, view } from "./lib/near";

const MIN_TESTNET_RESERVE = nearToYocto(10);

async function main(): Promise<void> {
  const env = loadEnv();
  const secret = requireSecret(env, "DEPLOYER_PRIVATE_KEY");
  const amount = nearToYocto(env.BOUNTYBOARD_RESERVE_NEAR);

  if (env.NEAR_NETWORK === "testnet" && amount < MIN_TESTNET_RESERVE) {
    throw new Error(
      `BOUNTYBOARD_RESERVE_NEAR must be at least 10 on testnet, got ${env.BOUNTYBOARD_RESERVE_NEAR}`,
    );
  }
  if (amount <= 0n) {
    throw new Error("BOUNTYBOARD_RESERVE_NEAR must be positive");
  }

  const before = BigInt(
    await view<string>(env, env.BOUNTYBOARD_ACCOUNT, "get_reserve"),
  );
  const response = await callRaw(
    env,
    env.DEPLOYER_ACCOUNT,
    secret,
    env.BOUNTYBOARD_ACCOUNT,
    "fund_reserve",
    {},
    { deposit: amount },
  );
  const after = BigInt(
    await view<string>(env, env.BOUNTYBOARD_ACCOUNT, "get_reserve"),
  );

  if (after < before + amount) {
    throw new Error(
      `Reserve did not increase by the funded amount: ${before} -> ${after}`,
    );
  }

  console.log(`Funded ${env.BOUNTYBOARD_ACCOUNT} reserve with ${env.BOUNTYBOARD_RESERVE_NEAR} NEAR`);
  console.log(`Transaction: ${response.transaction.hash}`);
  console.log(`Reserve: ${formatNearAmount(after.toString())} NEAR`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
