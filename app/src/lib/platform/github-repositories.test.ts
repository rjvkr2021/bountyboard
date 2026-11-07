import { describe, expect, it } from "vitest";
import { listGithubAdminRepositories } from "./github-repositories";

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("listGithubAdminRepositories", () => {
  it("returns only public repositories where the viewer is an admin", async () => {
    const repositories = await listGithubAdminRepositories("token", (async () =>
      response([
        {
          id: 1,
          name: "public-admin",
          full_name: "owner/public-admin",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/owner/public-admin",
          owner: { login: "owner" },
          permissions: { admin: true },
        },
        {
          id: 2,
          name: "private-admin",
          full_name: "owner/private-admin",
          private: true,
          default_branch: "main",
          html_url: "https://github.com/owner/private-admin",
          owner: { login: "owner" },
          permissions: { admin: true },
        },
        {
          id: 3,
          name: "public-read",
          full_name: "owner/public-read",
          private: false,
          default_branch: "main",
          html_url: "https://github.com/owner/public-read",
          owner: { login: "owner" },
          permissions: { admin: false },
        },
      ])) as typeof fetch);

    expect(repositories).toEqual([
      {
        id: 1,
        owner: "owner",
        name: "public-admin",
        fullName: "owner/public-admin",
        defaultBranch: "main",
        htmlUrl: "https://github.com/owner/public-admin",
      },
    ]);
  });

  it("reports a missing repository scope", async () => {
    await expect(
      listGithubAdminRepositories("token", (async () => response({}, 403)) as typeof fetch),
    ).rejects.toThrow(/Sign out and sign in again/);
  });
});
