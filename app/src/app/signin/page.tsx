import type { Metadata } from "next";
import Link from "next/link";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { GitHubSignIn } from "@/components/auth/github-sign-in";
import { PageHeader, SectionCard } from "@/components/ui";
import { getPlatformConfig } from "@/lib/platform/config";

export const metadata: Metadata = {
  title: "Sign in | BountyBoard",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const { github } = getPlatformConfig();
  const configured = Boolean(github.clientId && github.clientSecret);

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Sign in"
        description="Use email and password, or continue with GitHub. GitHub is required to claim and verify bounty work."
      />
      <SectionCard title="Email and password">
        <EmailAuthForm mode="signin" nextPath={next} />
        <p className="mt-3 text-center text-[11px] text-muted">
          New here?{" "}
          <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent hover:underline">
            Create an account
          </Link>
        </p>
      </SectionCard>
      <SectionCard title="GitHub">
        <GitHubSignIn configured={configured} nextPath={next} />
      </SectionCard>
    </div>
  );
}
