import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { nearToYocto } from "near-api-js";

import { loadEnv, requireSecret } from "./lib/env";
import {
  accountExists,
  call,
  createSubaccount,
  deployContract,
  hasContractCode,
  publicKeyFromSecret,
  view,
} from "./lib/near";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WASM = "contracts/bounty-board/target/near/bounty_board.wasm";
const INIT_GAS = 100n * 1_000_000_000_000n;

interface BoardConfig {
  bootstrap_until_maintainers: number;
  maintainer_challenge_secs: number;
  council_promotion_min_tenure_secs: number;
  council_promotion_delay_secs: number;
  council_promotion_min_approvals: number;
  council_role_name: string;
}

interface BootstrapState {
  active: boolean;
  maintainers_len: number;
  threshold: number;
  ended: boolean;
}

interface TxResult {
  transaction?: { hash: string };
  transaction_outcome?: { id: string };
}

function txHash(result: TxResult): string {
  return result.transaction?.hash ?? result.transaction_outcome?.id ?? "unknown";
}

function boardConfig(env: ReturnType<typeof loadEnv>): BoardConfig {
  return {
    bootstrap_until_maintainers: env.BOOTSTRAP_UNTIL_MAINTAINERS,
    maintainer_challenge_secs: env.MAINTAINER_CHALLENGE_SECS,
    council_promotion_min_tenure_secs:
      env.COUNCIL_PROMOTION_MIN_TENURE_SECS,
    council_promotion_delay_secs: env.COUNCIL_PROMOTION_DELAY_SECS,
    council_promotion_min_approvals: env.COUNCIL_PROMOTION_MIN_APPROVALS,
    council_role_name: env.COUNCIL_ROLE_NAME,
  };
}

async function ensureAccount(
  env: ReturnType<typeof loadEnv>,
  deployerSecret: string,
): Promise<void> {
  if (await accountExists(env, env.BOUNTYBOARD_ACCOUNT)) {
    console.log(`BountyBoard account ${env.BOUNTYBOARD_ACCOUNT} already exists`);
    return;
  }

  const suffix = `.${env.DAO_ACCOUNT}`;
  if (!env.BOUNTYBOARD_ACCOUNT.endsWith(suffix)) {
    throw new Error(
      `BountyBoard account ${env.BOUNTYBOARD_ACCOUNT} does not exist and is ` +
        `not a subaccount of the DAO ${env.DAO_ACCOUNT}.`,
    );
  }

  const initialBalance = nearToYocto(env.BOUNTYBOARD_INITIAL_BALANCE_NEAR);
  console.log(
    `Creating ${env.BOUNTYBOARD_ACCOUNT} with ${initialBalance} yoctoNEAR`,
  );
  const publicKey = await publicKeyFromSecret(deployerSecret);
  const result = (await createSubaccount(
    env,
    env.DAO_ACCOUNT,
    deployerSecret,
    env.BOUNTYBOARD_ACCOUNT,
    publicKey,
    initialBalance,
  )) as TxResult;
  console.log(`Account created: ${txHash(result)}`);
}

async function printState(env: ReturnType<typeof loadEnv>): Promise<void> {
  const dao = await view<string>(env, env.BOUNTYBOARD_ACCOUNT, "get_dao");
  const config = await view<BoardConfig>(
    env,
    env.BOUNTYBOARD_ACCOUNT,
    "get_config",
  );
  const bootstrap = await view<BootstrapState>(
    env,
    env.BOUNTYBOARD_ACCOUNT,
    "get_bootstrap_state",
  );

  console.log(`BountyBoard: ${env.BOUNTYBOARD_ACCOUNT}`);
  console.log(`DAO: ${dao}`);
  console.log(`Config: ${JSON.stringify(config)}`);
  console.log(`Bootstrap: ${JSON.stringify(bootstrap)}`);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const deployerSecret = requireSecret(env, "DEPLOYER_PRIVATE_KEY");

  if (env.DAO_ACCOUNT === env.BOUNTYBOARD_ACCOUNT) {
    throw new Error("DAO_ACCOUNT and BOUNTYBOARD_ACCOUNT must differ");
  }
  if (!(await accountExists(env, env.DAO_ACCOUNT))) {
    throw new Error(`DAO account ${env.DAO_ACCOUNT} does not exist`);
  }

  const wasmPath = resolve(
    repoRoot,
    env.BOUNTYBOARD_WASM_PATH ?? DEFAULT_WASM,
  );
  let wasm: Uint8Array;
  try {
    wasm = new Uint8Array(await readFile(wasmPath));
  } catch {
    throw new Error(
      `BountyBoard wasm not found at ${wasmPath}. Run ` +
        `"npm run smart-contract:build" first.`,
    );
  }

  await ensureAccount(env, deployerSecret);

  if (await hasContractCode(env, env.BOUNTYBOARD_ACCOUNT)) {
    console.log(`Contract code already deployed to ${env.BOUNTYBOARD_ACCOUNT}`);
    await printState(env);
    return;
  }

  console.log(`Deploying BountyBoard wasm to ${env.BOUNTYBOARD_ACCOUNT}`);
  const deployResult = (await deployContract(
    env,
    env.BOUNTYBOARD_ACCOUNT,
    deployerSecret,
    wasm,
  )) as TxResult;
  console.log(`Deploy tx: ${txHash(deployResult)}`);

  const config = boardConfig(env);
  console.log("Initializing BountyBoard");
  const initResult = (await call(
    env,
    env.BOUNTYBOARD_ACCOUNT,
    deployerSecret,
    env.BOUNTYBOARD_ACCOUNT,
    "new",
    { dao: env.DAO_ACCOUNT, config },
    { gas: INIT_GAS },
  )) as TxResult;
  console.log(`Init tx: ${txHash(initResult)}`);

  await printState(env);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
