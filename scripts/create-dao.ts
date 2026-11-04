import { readFile } from "node:fs/promises";

import { nearToYocto } from "near-api-js";

import { fetchSputnik } from "./fetch-sputnik";
import { loadEnv, requireSecret } from "./lib/env";
import {
  accountExists,
  call,
  createSubaccount,
  deployContract,
  getBalance,
  hasContractCode,
  publicKeyFromSecret,
  view,
} from "./lib/near";
import { buildPolicyFromEnv, type Policy } from "./lib/policy";

const DAO_CALL_GAS = 200n * 1_000_000_000_000n;

interface DaoConfig {
  name: string;
  purpose: string;
  metadata: string;
}

interface TxResult {
  transaction?: { hash: string };
  transaction_outcome?: { id: string };
}

function txHash(result: TxResult): string {
  return result.transaction?.hash ?? result.transaction_outcome?.id ?? "unknown";
}

function daoConfig(): DaoConfig {
  return {
    name: process.env.DAO_NAME ?? "BountyBoard DAO",
    purpose:
      process.env.DAO_PURPOSE ??
      "Funds open-source bounties with verifiable payouts.",
    metadata: "",
  };
}

async function ensureAccount(
  env: ReturnType<typeof loadEnv>,
  deployerSecret: string,
): Promise<boolean> {
  if (await accountExists(env, env.DAO_ACCOUNT)) {
    console.log(`DAO account ${env.DAO_ACCOUNT} already exists`);
    return false;
  }

  const suffix = `.${env.DEPLOYER_ACCOUNT}`;
  if (!env.DAO_ACCOUNT.endsWith(suffix)) {
    throw new Error(
      `DAO account ${env.DAO_ACCOUNT} does not exist and is not a subaccount of ` +
        `${env.DEPLOYER_ACCOUNT}. Create it first with near-cli or set ` +
        `DAO_ACCOUNT to a subaccount of the deployer.`,
    );
  }

  const initialBalance = nearToYocto(env.DAO_INITIAL_BALANCE_NEAR);
  console.log(
    `Creating ${env.DAO_ACCOUNT} with ${initialBalance} yoctoNEAR`,
  );
  const publicKey = await publicKeyFromSecret(deployerSecret);
  const result = (await createSubaccount(
    env,
    env.DEPLOYER_ACCOUNT,
    deployerSecret,
    env.DAO_ACCOUNT,
    publicKey,
    initialBalance,
  )) as TxResult;

  console.log(`Account created: ${txHash(result)}`);
  return true;
}

async function main(): Promise<void> {
  const env = loadEnv();
  const deployerSecret = requireSecret(env, "DEPLOYER_PRIVATE_KEY");
  const wasmPath = await fetchSputnik();
  const wasm = new Uint8Array(await readFile(wasmPath));

  if (!(await accountExists(env, env.DEPLOYER_ACCOUNT))) {
    throw new Error(`Deployer account ${env.DEPLOYER_ACCOUNT} does not exist`);
  }

  await ensureAccount(env, deployerSecret);

  const codeDeployed = await hasContractCode(env, env.DAO_ACCOUNT);
  if (codeDeployed) {
    console.log(`Contract code already deployed to ${env.DAO_ACCOUNT}`);
    const existingConfig = await view(env, env.DAO_ACCOUNT, "get_config");
    const existingPolicy = await view<Policy>(env, env.DAO_ACCOUNT, "get_policy");
    console.log(`Config: ${JSON.stringify(existingConfig)}`);
    console.log(`Policy: ${JSON.stringify(existingPolicy)}`);
    return;
  }

  const policy = buildPolicyFromEnv(env);
  const config = daoConfig();

  console.log(`Deploying Sputnik DAO wasm to ${env.DAO_ACCOUNT}`);
  const deployResult = (await deployContract(
    env,
    env.DAO_ACCOUNT,
    deployerSecret,
    wasm,
  )) as TxResult;
  console.log(`Deploy tx: ${txHash(deployResult)}`);

  console.log("Initializing DAO with the custom policy");
  const initResult = (await call(
    env,
    env.DAO_ACCOUNT,
    deployerSecret,
    env.DAO_ACCOUNT,
    "new",
    { config, policy },
    { gas: DAO_CALL_GAS },
  )) as TxResult;
  console.log(`Init tx: ${txHash(initResult)}`);

  const deployedConfig = await view(env, env.DAO_ACCOUNT, "get_config");
  const deployedPolicy = await view<Policy>(env, env.DAO_ACCOUNT, "get_policy");
  const balance = await getBalance(env, env.DAO_ACCOUNT);

  console.log(`DAO: ${env.DAO_ACCOUNT}`);
  console.log(`Balance: ${balance} yoctoNEAR`);
  console.log(`Config: ${JSON.stringify(deployedConfig)}`);
  console.log(`Policy: ${JSON.stringify(deployedPolicy)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
