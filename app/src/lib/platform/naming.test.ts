import { describe, expect, it } from "vitest";
import {
  MAX_NEAR_ACCOUNT_ID_LENGTH,
  MAX_REPO_SLUG_LENGTH,
  MIN_REPO_SLUG_LENGTH,
  isRepoSlug,
  platformAccountNames,
  slugFromRepoName,
  validateRepoSlug,
} from "./naming";

describe("validateRepoSlug", () => {
  it("accepts lowercase alphanumeric slugs at the length boundaries", () => {
    expect(validateRepoSlug("a".repeat(MIN_REPO_SLUG_LENGTH))).toEqual({
      valid: true,
    });
    expect(validateRepoSlug("a".repeat(MAX_REPO_SLUG_LENGTH))).toEqual({
      valid: true,
    });
    expect(validateRepoSlug("bounty-board-2")).toEqual({ valid: true });
  });

  it("rejects slugs outside the length boundaries", () => {
    expect(validateRepoSlug("ab")).toEqual({ valid: false, reason: "length" });
    expect(validateRepoSlug("a".repeat(MAX_REPO_SLUG_LENGTH + 1))).toEqual({
      valid: false,
      reason: "length",
    });
  });

  it("rejects uppercase, separators, and edge hyphens", () => {
    for (const slug of ["Bounty", "bounty_board", "bounty board", "-bounty", "bounty-"]) {
      expect(validateRepoSlug(slug)).toEqual({ valid: false, reason: "format" });
    }
  });

  it("narrows valid slugs", () => {
    expect(isRepoSlug("bounty-board")).toBe(true);
    expect(isRepoSlug("Bounty")).toBe(false);
  });
});

describe("platformAccountNames", () => {
  it("derives DAO, board, and oracle account ids", () => {
    const names = platformAccountNames("bounty-board", "bountyboard.testnet");

    expect(names).toEqual({
      dao: "bounty-board-dao.bountyboard.testnet",
      board: "bounty-board-board.bountyboard.testnet",
      oracle: "bounty-board-oracle.bountyboard.testnet",
    });
    for (const accountId of Object.values(names)) {
      expect(accountId.length).toBeLessThanOrEqual(MAX_NEAR_ACCOUNT_ID_LENGTH);
    }
  });

  it("rejects invalid slugs and over-long roots", () => {
    expect(() => platformAccountNames("Bounty", "root.testnet")).toThrow(
      "Invalid repo slug",
    );
    expect(() =>
      platformAccountNames("bounty", "a".repeat(MAX_NEAR_ACCOUNT_ID_LENGTH)),
    ).toThrow("exceeds 64 characters");
  });
});

describe("slugFromRepoName", () => {
  it("normalizes GitHub repo names", () => {
    expect(slugFromRepoName("Bounty Board")).toBe("bounty-board");
    expect(slugFromRepoName("bounty__board...")).toBe("bounty-board");
  });

  it("returns null when no usable slug remains", () => {
    expect(slugFromRepoName("ab")).toBeNull();
    expect(slugFromRepoName("!!")).toBeNull();
  });

  it("truncates long names to the slug limit", () => {
    const slug = slugFromRepoName(`${"a".repeat(40)}-tail`);
    expect(slug).toHaveLength(MAX_REPO_SLUG_LENGTH);
    expect(isRepoSlug(slug ?? "")).toBe(true);
  });
});
