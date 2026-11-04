import { describe, expect, it } from "vitest";

import { parseLinkedIssue } from "./parse-linked-issue";

describe("parseLinkedIssue", () => {
  it.each([
    ["Fixes #12", 12],
    ["fixes #34", 34],
    ["Closes #56", 56],
    ["closed #78", 78],
    ["Resolves #90", 90],
    ["resolved: #123", 123],
    ["This PR fixes #7 and closes #8.", 7],
  ])("parses %s", (body, expected) => {
    expect(parseLinkedIssue(body)).toBe(expected);
  });

  it("returns the first linked issue", () => {
    expect(parseLinkedIssue("Closes #9\nFixes #2")).toBe(9);
  });

  it.each([
    "",
    "No issue reference",
    "Fixes #abc",
    "Fixes #0",
    "#42",
    "Related to #42",
  ])("returns null for %s", (body) => {
    expect(parseLinkedIssue(body)).toBeNull();
  });

  it("ignores fenced code blocks", () => {
    const body = ["```", "Fixes #1", "```", "", "Closes #2"].join("\n");
    expect(parseLinkedIssue(body)).toBe(2);
  });

  it("uses only the first reference outside code blocks", () => {
    const body = ["Fixes #3", "```", "Fixes #4", "```"].join("\n");
    expect(parseLinkedIssue(body)).toBe(3);
  });
});
