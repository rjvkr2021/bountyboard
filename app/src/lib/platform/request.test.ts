import { describe, expect, it } from "vitest";
import { isTrustedRequest } from "./request";

function request(headers: Record<string, string>): Request {
  return new Request("https://bountyboard.example/api/platform/repos", { headers });
}

describe("isTrustedRequest", () => {
  it("accepts same-origin requests", () => {
    expect(
      isTrustedRequest(
        request({
          origin: "https://bountyboard.example",
          host: "bountyboard.example",
        }),
      ),
    ).toBe(true);
  });

  it("accepts same-origin requests behind a proxy", () => {
    expect(
      isTrustedRequest(
        request({
          origin: "https://bountyboard.example",
          host: "internal:3000",
          "x-forwarded-host": "bountyboard.example",
        }),
      ),
    ).toBe(true);
  });

  it("rejects cross-site origins", () => {
    expect(
      isTrustedRequest(
        request({
          origin: "https://evil.example",
          host: "bountyboard.example",
        }),
      ),
    ).toBe(false);
  });

  it("rejects malformed origins", () => {
    expect(
      isTrustedRequest(request({ origin: "not a url", host: "bountyboard.example" })),
    ).toBe(false);
  });

  it("accepts requests without an origin header", () => {
    expect(isTrustedRequest(request({ host: "bountyboard.example" }))).toBe(true);
  });
});
