import { stat } from "node:fs/promises";
import type { PlatformConfig } from "../config";
import { nearToYocto } from "../../format";

const PROPOSAL_COUNT = 3;
const STORAGE_PRICE_YOCTO_PER_BYTE = 10n ** 19n;
const CONTRACT_OVERHEAD_YOCTO = BigInt(nearToYocto("0.5"));
const ORACLE_FUNDING_YOCTO = BigInt(nearToYocto("1"));
const PAYOUT_BOND_RESERVE_YOCTO = BigInt(nearToYocto("1"));

export interface LaunchFundingRequirement {
  near: string;
  yocto: string;
  budgetYocto: string;
  daoStorageYocto: string;
  boardStorageYocto: string;
  daoFundingYocto: string;
  boardFundingYocto: string;
  payoutBondReserveYocto: string;
  oracleFundingYocto: string;
  bondsYocto: string;
  bufferYocto: string;
  deployer: string;
  boardWasmBytes: number;
  sputnikWasmBytes: number;
}

function decimalYocto(yocto: bigint): string {
  const whole = yocto / 10n ** 24n;
  const fraction = yocto % 10n ** 24n;
  if (fraction === 0n) return whole.toString();
  return `${whole}.${fraction.toString().padStart(24, "0").replace(/0+$/, "")}`;
}

export function calculateLaunchFunding(
  config: PlatformConfig,
  budgetNear: string | number,
  wasm: { boardWasmBytes: number; sputnikWasmBytes: number },
): LaunchFundingRequirement {
  const budget = BigInt(nearToYocto(String(budgetNear)));
  const daoStorage = BigInt(wasm.sputnikWasmBytes) * STORAGE_PRICE_YOCTO_PER_BYTE + CONTRACT_OVERHEAD_YOCTO;
  const boardStorage = BigInt(wasm.boardWasmBytes) * STORAGE_PRICE_YOCTO_PER_BYTE + CONTRACT_OVERHEAD_YOCTO;
  const bonds = BigInt(nearToYocto(config.near.proposalBondNear)) * BigInt(PROPOSAL_COUNT);
  const buffer = BigInt(nearToYocto(config.near.launchFundingBufferNear));
  const daoFunding = daoStorage + budget;
  const boardFunding = boardStorage + PAYOUT_BOND_RESERVE_YOCTO;
  const total = daoFunding + boardFunding + ORACLE_FUNDING_YOCTO + bonds + buffer;

  return {
    near: decimalYocto(total),
    yocto: total.toString(),
    budgetYocto: budget.toString(),
    daoStorageYocto: daoStorage.toString(),
    boardStorageYocto: boardStorage.toString(),
    daoFundingYocto: daoFunding.toString(),
    boardFundingYocto: boardFunding.toString(),
    payoutBondReserveYocto: PAYOUT_BOND_RESERVE_YOCTO.toString(),
    oracleFundingYocto: ORACLE_FUNDING_YOCTO.toString(),
    bondsYocto: bonds.toString(),
    bufferYocto: buffer.toString(),
    deployer: config.near.deployerAccount,
    boardWasmBytes: wasm.boardWasmBytes,
    sputnikWasmBytes: wasm.sputnikWasmBytes,
  };
}

export async function launchFundingRequirement(
  config: PlatformConfig,
  budgetNear: string | number = "0",
): Promise<LaunchFundingRequirement> {
  const [board, sputnik] = await Promise.all([
    stat(config.near.boardWasm),
    stat(config.near.sputnikWasm),
  ]);
  return calculateLaunchFunding(config, budgetNear, {
    boardWasmBytes: board.size,
    sputnikWasmBytes: sputnik.size,
  });
}
