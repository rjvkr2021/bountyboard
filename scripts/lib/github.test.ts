import { describe, expect, it } from "vitest";

import { normalizeGithubHandle } from "./github";

describe("normalizeGithubHandle", () => {
  it.each([
    ["Alice", "alice"],
    ["  @Alice-123 ", "alice-123"],
    ["a", "a"],
    ["a".repeat(39), "a".repeat(39)],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeGithubHandle(input)).toBe(expected);
  });

  it.each(["", " ", "@", "-alice", "alice-", "alice_bob", "alice bob", "a".repeat(40)])(
    "rejects %s",
    (input) => {
      expect(normalizeGithubHandle(input)).toBeNull();
    },
  );
});
