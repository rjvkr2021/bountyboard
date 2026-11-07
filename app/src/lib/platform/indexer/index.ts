import { randomUUID } from "node:crypto";
import type { PlatformConfig } from "../config";
import type { PlatformStore } from "../store";
import type { IssueSnapshot } from "../types";
import { NearBoardReader, type BoardReader } from "./reader";

function nowIso(): string {
  return new Date().toISOString();
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface IndexerRunSummary {
  boards: number;
  changedBoards: number;
  changedIssues: number;
  errors: Array<{ boardAccount: string; error: string }>;
}

export class IndexerService {
  private readonly reader: BoardReader;

  constructor(
    private readonly store: PlatformStore,
    config: PlatformConfig,
    reader?: BoardReader,
  ) {
    this.reader = reader ?? new NearBoardReader(config.rpcUrl);
  }

  async tick(): Promise<IndexerRunSummary> {
    const summary: IndexerRunSummary = {
      boards: 0,
      changedBoards: 0,
      changedIssues: 0,
      errors: [],
    };

    for (const deployment of this.store.listDeployments()) {
      if (deployment.status !== "active" || !deployment.boardAccount) continue;
      const previous = this.store.getBoard(deployment.boardAccount);
      if (!previous) continue;
      summary.boards += 1;
      try {
        const result = await this.reader.read(deployment.boardAccount, previous);
        if (!sameJson(result.board, previous)) {
          await this.store.upsertBoard(result.board);
          summary.changedBoards += 1;
          await this.store.appendEvent({
            id: randomUUID(),
            boardAccount: deployment.boardAccount,
            type: "board_state_reconciled",
            payload: {
              github_repo: result.board.githubRepo,
              budget: result.board.budget,
              committed: result.board.committed,
              paused: result.board.paused,
            },
            txHash: null,
            blockHeight: result.blockHeight || null,
            occurredAt: nowIso(),
            ingestedAt: nowIso(),
          });
        }

        for (const issue of result.issues) {
          const existing = this.store.getIssue(deployment.boardAccount, issue.issueId);
          if (!existing || !sameJson(existing, issue)) {
            await this.store.upsertIssue(issue);
            summary.changedIssues += 1;
            if (existing && existing.status !== issue.status) {
              await this.store.appendEvent({
                id: randomUUID(),
                boardAccount: deployment.boardAccount,
                type: "issue_status_changed",
                payload: {
                  issue_id: issue.issueId,
                  issue_number: issue.issueNumber,
                  from: existing.status,
                  to: issue.status,
                },
                txHash: null,
                blockHeight: result.blockHeight || null,
                occurredAt: nowIso(),
                ingestedAt: nowIso(),
              });
            }
          }
        }

        if (result.blockHeight > 0) {
          await this.store.setCursor({
            boardAccount: deployment.boardAccount,
            blockHeight: result.blockHeight,
            blockHash: result.blockHash,
            updatedAt: nowIso(),
          });
        }
      } catch (error) {
        summary.errors.push({
          boardAccount: deployment.boardAccount,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return summary;
  }
}

export type { BoardReader, IssueSnapshot };
