import { NextResponse } from "next/server";
import { getPlatformStore } from "@/lib/platform/store-singleton";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface GithubIssue {
  number?: unknown;
  title?: unknown;
  state?: unknown;
  html_url?: unknown;
  pull_request?: unknown;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const number = Number(new URL(request.url).searchParams.get("number"));
  if (!Number.isInteger(number) || number <= 0) {
    return NextResponse.json({ error: "Enter a valid GitHub issue number" }, { status: 400 });
  }
  const repository = (await getPlatformStore()).getRepositoryBySlug(slug);
  if (!repository || repository.isPrivate) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  let response: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch(
        `https://api.github.com/repos/${repository.fullName}/issues/${number}`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "BountyBoard",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          cache: "no-store",
        },
      );
      if (response.status < 500) break;
    } catch {
      // Retry transient network failures.
    }
    await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
  }
  if (!response) {
    return NextResponse.json({ error: "GitHub issue lookup failed" }, { status: 502 });
  }
  if (response.status === 404) {
    return NextResponse.json({ error: `GitHub issue #${number} was not found` }, { status: 404 });
  }
  if (!response.ok) {
    return NextResponse.json({ error: `GitHub returned HTTP ${response.status}` }, { status: 502 });
  }
  const issue = (await response.json().catch(() => null)) as GithubIssue | null;
  if (!issue || typeof issue.number !== "number" || typeof issue.title !== "string") {
    return NextResponse.json({ error: "GitHub returned an invalid issue" }, { status: 502 });
  }
  if (issue.pull_request) {
    return NextResponse.json({ error: "That number is a pull request, not an issue" }, { status: 400 });
  }
  if (issue.state !== "open") {
    return NextResponse.json({ error: "The GitHub issue is not open" }, { status: 400 });
  }
  return NextResponse.json({
    issue: {
      number: issue.number,
      title: issue.title,
      state: issue.state,
      htmlUrl: typeof issue.html_url === "string" ? issue.html_url : null,
    },
  });
}
