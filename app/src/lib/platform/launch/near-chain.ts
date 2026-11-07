import { readFile } from "node:fs/promises";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  getTransactionLastResult,
  type KeyPairString,
} from "near-api-js";

const GAS = 300_000_000_000_000n;

export interface NearChainConfig {
  rpcUrl: string;
  deployerAccount: string;
  deployerPrivateKey: string;
}

export interface NearChain {
  createSubAccount(
    accountId: string,
    publicKey: string,
    balanceYocto: string,
  ): Promise<string>;
  deploy(accountId: string, secretKey: string, wasmPath: string): Promise<string>;
  call(
    signerAccount: string,
    secretKey: string,
    contractId: string,
    methodName: string,
    args: Record<string, unknown>,
    options?: { deposit?: bigint; gas?: bigint },
  ): Promise<unknown>;
  callWithResult(
    signerAccount: string,
    secretKey: string,
    contractId: string,
    methodName: string,
    args: Record<string, unknown>,
    options?: { deposit?: bigint; gas?: bigint },
  ): Promise<{ hash: string; result: unknown }>;
  deleteKey(accountId: string, secretKey: string, publicKey: string): Promise<string>;
  view<T>(contractId: string, methodName: string, args?: Record<string, unknown>): Promise<T>;
}

export class JsonRpcNearChain implements NearChain {
  private readonly provider: JsonRpcProvider;

  constructor(private readonly config: NearChainConfig) {
    this.provider = new JsonRpcProvider({ url: config.rpcUrl });
  }

  private account(accountId: string, secretKey: string): Account {
    return new Account(accountId, this.provider, secretKey as KeyPairString);
  }

  private deployer(): Account {
    return this.account(this.config.deployerAccount, this.config.deployerPrivateKey);
  }

  async createSubAccount(
    accountId: string,
    publicKey: string,
    balanceYocto: string,
  ): Promise<string> {
    const result = await this.deployer().createSubAccount({
      accountOrPrefix: accountId,
      publicKey,
      nearToTransfer: balanceYocto,
    });
    return result.transaction.hash;
  }

  async deploy(accountId: string, secretKey: string, wasmPath: string): Promise<string> {
    const wasm = await readFile(wasmPath);
    const result = await this.account(accountId, secretKey).deployContract(
      new Uint8Array(wasm),
    );
    return result.transaction.hash;
  }

  async call(
    signerAccount: string,
    secretKey: string,
    contractId: string,
    methodName: string,
    args: Record<string, unknown>,
    options: { deposit?: bigint; gas?: bigint } = {},
  ): Promise<unknown> {
    const outcome = await this.account(signerAccount, secretKey).callFunctionRaw({
      contractId,
      methodName,
      args,
      deposit: options.deposit ?? 0n,
      gas: options.gas ?? GAS,
    });
    return outcome.transaction.hash;
  }

  async callWithResult(
    signerAccount: string,
    secretKey: string,
    contractId: string,
    methodName: string,
    args: Record<string, unknown>,
    options: { deposit?: bigint; gas?: bigint } = {},
  ): Promise<{ hash: string; result: unknown }> {
    const outcome = await this.account(signerAccount, secretKey).callFunctionRaw({
      contractId,
      methodName,
      args,
      deposit: options.deposit ?? 0n,
      gas: options.gas ?? GAS,
    });
    return {
      hash: outcome.transaction.hash,
      result: getTransactionLastResult(outcome),
    };
  }

  async deleteKey(
    accountId: string,
    secretKey: string,
    publicKey: string,
  ): Promise<string> {
    const result = await this.account(accountId, secretKey).deleteKey(publicKey);
    return result.transaction.hash;
  }

  async view<T>(
    contractId: string,
    methodName: string,
    args: Record<string, unknown> = {},
  ): Promise<T> {
    return this.provider.callFunction({ contractId, method: methodName, args }) as Promise<T>;
  }
}

export function generateAccountKey(): { secretKey: string; publicKey: string } {
  const pair = KeyPair.fromRandom("ED25519");
  return {
    secretKey: pair.toString(),
    publicKey: pair.getPublicKey().toString(),
  };
}
