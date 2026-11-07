import { describe, expect, it, vi } from "vitest";
import { GithubAdminError, verifyGithubRepoAdmin } from "./github-admin";

const adminResponse = {
  data: {
    repository: {
      databaseId: 42,
      nameWithOwner: "octo/repo",
      isPrivate: false,
      viewerPermission: "ADMIN",
      defaultBranchRef: { name: "main" },
    },
    viewer: { login: "octocat", databaseId: 99 },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verifyGithubRepoAdmin", () => {
  it("returns repo identity when the viewer is an admin", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(adminResponse));

    await expect(
      verifyGithubRepoAdmin({
        token: "user-token",
        owner: "octo",
        repo: "repo",
        fetchImpl,
      }),
    ).resolves.toEqual({
      repoId: 42,
      fullName: "octo/repo",
      defaultBranch: "main",
      isPrivate: false,
      viewerId: 99,
      viewerLogin: "octocat",
      viewerPermission: "ADMIN",
    });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer user-token",
      "X-GitHub-Api-Version": "2022-11-28",
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      variables: { owner: "octo", name: "repo" },
    });
  });

  it("rejects viewers without admin permission", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ...adminResponse,
        data: {
          ...adminResponse.data,
          repository: {
            ...adminResponse.data.repository,
            viewerPermission: "MAINTAIN",
          },
        },
      }),
    );

    await expect(
      verifyGithubRepoAdmin({
        token: "user-token",
        owner: "octo",
        repo: "repo",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "not_admin" });
  });

  it("maps missing repositories to not_found", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: { repository: null, viewer: { login: "octocat", databaseId: 99 } } }),
    );

    await expect(
      verifyGithubRepoAdmin({
        token: "user-token",
        owner: "octo",
        repo: "missing",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("maps rejected tokens to unauthorized", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 401));

    await expect(
      verifyGithubRepoAdmin({
        token: "bad-token",
        owner: "octo",
        repo: "repo",
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(GithubAdminError);
    await expect(
      verifyGithubRepoAdmin({
        token: "bad-token",
        owner: "octo",
        repo: "repo",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("maps GraphQL errors without leaking the token", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ errors: [{ type: "FORBIDDEN", message: "nope" }] }),
    );

    const error = await verifyGithubRepoAdmin({
      token: "user-token",
      owner: "octo",
      repo: "repo",
      fetchImpl,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GithubAdminError);
    expect(error).toMatchObject({ code: "github_error" });
    expect(String((error as Error).message)).not.toContain("user-token");
  });

  it("rejects missing tokens before calling GitHub", async () => {
    const fetchImpl = vi.fn();

    await expect(
      verifyGithubRepoAdmin({
        token: "",
        owner: "octo",
        repo: "repo",
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
