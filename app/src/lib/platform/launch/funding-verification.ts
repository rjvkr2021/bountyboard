import type { PlatformConfig } from "../config";

interface FundingTransactionAction {
  Transfer?: { deposit?: unknown };
}

interface FundingTransaction {
  signer_id?: unknown;
  receiver_id?: unknown;
  actions?: unknown;
}

interface FundingTransactionResponse {
  transaction?: FundingTransaction;
  status?: { Failure?: unknown; SuccessValue?: unknown };
  transaction_outcome?: {
    outcome?: { status?: { Failure?: unknown } };
  };
}

export class LaunchFundingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LaunchFundingError";
  }
}

export async function verifyLaunchFunding(input: {
  config: PlatformConfig;
  txHash: string;
  founder: string;
  requiredYocto: string;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl(input.config.rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "launch-funding",
      method: "tx",
      params: {
        tx_hash: input.txHash,
        sender_account_id: input.founder,
        wait_until: "FINAL",
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new LaunchFundingError(502, `Could not verify the funding transaction (HTTP ${response.status})`);
  }

  const body = (await response.json().catch(() => null)) as
    | { result?: FundingTransactionResponse; error?: { message?: string } }
    | null;
  if (body?.error) {
    throw new LaunchFundingError(400, "The launch funding transaction was not found");
  }
  const result = body?.result;
  if (!result?.transaction) {
    throw new LaunchFundingError(400, "The launch funding transaction was not found");
  }
  if (result.status?.Failure || result.transaction_outcome?.outcome?.status?.Failure) {
    throw new LaunchFundingError(400, "The launch funding transaction failed");
  }

  if (result.transaction.signer_id !== input.founder) {
    throw new LaunchFundingError(400, "The launch funding transaction was not signed by the linked founder account");
  }
  if (result.transaction.receiver_id !== input.config.near.deployerAccount) {
    throw new LaunchFundingError(
      400,
      `The launch funding transaction must be sent to ${input.config.near.deployerAccount}`,
    );
  }

  const actions = Array.isArray(result.transaction.actions)
    ? (result.transaction.actions as FundingTransactionAction[])
    : [];
  const deposited = actions.reduce((sum, action) => {
    const deposit = action.Transfer?.deposit;
    if (typeof deposit !== "string" || !/^\d+$/.test(deposit)) return sum;
    return sum + BigInt(deposit);
  }, 0n);

  if (deposited < BigInt(input.requiredYocto)) {
    throw new LaunchFundingError(
      400,
      "The launch funding transaction did not send enough NEAR",
    );
  }
}
