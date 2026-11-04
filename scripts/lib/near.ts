import {
  Account,
  JsonRpcProvider,
  KeyPairSigner,
  type KeyPairString,
  type PublicKey,
  type SerializedReturnValue,
} from "near-api-js";

import { rpcUrl, type NetworkEnv } from "./env";

export const TGAS = 1_000_000_000_000n;
export const DEFAULT_GAS = 30n * TGAS;
export const DEPLOY_GAS = 200n * TGAS;

export function rpcProvider(env: NetworkEnv): JsonRpcProvider {
  return new JsonRpcProvider({ url: rpcUrl(env) });
}

export function signerFromSecret(secret: string): KeyPairSigner {
  return KeyPairSigner.fromSecretKey(secret as KeyPairString);
}

export async function publicKeyFromSecret(secret: string): Promise<PublicKey> {
  return signerFromSecret(secret).getPublicKey();
}

export function signingAccount(
  env: NetworkEnv,
  accountId: string,
  secret: string,
): Account {
  return new Account(accountId, rpcProvider(env), signerFromSecret(secret));
}

export function readOnlyAccount(env: NetworkEnv, accountId: string): Account {
  return new Account(accountId, rpcProvider(env));
}

export async function view<T = SerializedReturnValue>(
  env: NetworkEnv,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const result = await rpcProvider(env).callFunction({
    contractId,
    method,
    args,
  });
  return result as T;
}

export async function call<T extends SerializedReturnValue = SerializedReturnValue>(
  env: NetworkEnv,
  senderAccountId: string,
  senderSecret: string,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
  options: { deposit?: bigint; gas?: bigint } = {},
): Promise<T> {
  const account = signingAccount(env, senderAccountId, senderSecret);
  return account.callFunction<T>({
    contractId,
    methodName: method,
    args,
    deposit: options.deposit ?? 0n,
    gas: options.gas ?? DEFAULT_GAS,
  });
}

export async function callRaw(
  env: NetworkEnv,
  senderAccountId: string,
  senderSecret: string,
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
  options: { deposit?: bigint; gas?: bigint } = {},
) {
  const account = signingAccount(env, senderAccountId, senderSecret);
  return account.callFunctionRaw({
    contractId,
    methodName: method,
    args,
    deposit: options.deposit ?? 0n,
    gas: options.gas ?? DEFAULT_GAS,
  });
}

export async function accountExists(
  env: NetworkEnv,
  accountId: string,
): Promise<boolean> {
  try {
    await rpcProvider(env).viewAccount({ accountId });
    return true;
  } catch (error) {
    if (isAccountMissingError(error)) {
      return false;
    }
    throw error;
  }
}

export async function getBalance(env: NetworkEnv, accountId: string): Promise<bigint> {
  const state = await rpcProvider(env).viewAccount({ accountId });
  return state.amount;
}

export async function hasContractCode(
  env: NetworkEnv,
  contractId: string,
): Promise<boolean> {
  try {
    const code = await rpcProvider(env).viewContractCode({ contractId });
    return code.code_base64.length > 0;
  } catch (error) {
    if (isMissingContractCodeError(error)) {
      return false;
    }
    throw error;
  }
}

export function isMissingContractCodeError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    message?: string;
    type?: string;
    cause?: unknown;
  };
  const text = `${candidate.message ?? ""} ${candidate.type ?? ""}`;
  if (/ContractCodeDoesNotExist|contract code[^]*does not exist/i.test(text)) {
    return true;
  }
  return candidate.cause ? isMissingContractCodeError(candidate.cause) : false;
}

export async function createSubaccount(
  env: NetworkEnv,
  parentAccountId: string,
  parentSecret: string,
  newAccountId: string,
  publicKey: PublicKey | string,
  initialBalance = 0n,
) {
  const parent = signingAccount(env, parentAccountId, parentSecret);
  return parent.createSubAccount({
    accountOrPrefix: newAccountId,
    publicKey,
    nearToTransfer: initialBalance,
  });
}

export async function deployContract(
  env: NetworkEnv,
  accountId: string,
  secret: string,
  wasm: Uint8Array,
) {
  const account = signingAccount(env, accountId, secret);
  return account.deployContract(wasm);
}

export function explorerTxUrl(network: string, hash: string): string {
  const base =
    network === "mainnet"
      ? "https://nearblocks.io/txns/"
      : "https://testnet.nearblocks.io/txns/";
  return `${base}${hash}`;
}

export function isAccountMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as {
    message?: string;
    type?: string;
    cause?: unknown;
  };
  const text = `${candidate.message ?? ""} ${candidate.type ?? ""}`;
  if (/AccountDoesNotExist|does not exist|unknown account/i.test(text)) {
    return true;
  }
  return candidate.cause ? isAccountMissingError(candidate.cause) : false;
}
