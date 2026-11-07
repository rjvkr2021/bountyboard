import type { Metadata } from "next";
import Link from "next/link";
import { EmailAuthForm } from "@/components/auth/email-auth-form";
import { PageHeader, SectionCard } from "@/components/ui";

export const metadata: Metadata = {
  title: "Create account | BountyBoard",
};

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <PageHeader
        eyebrow="Account"
        title="Create an account"
        description="Sign up with email and password. Link GitHub later to claim and verify bounty work."
      />
      <SectionCard title="Email and password">
        <EmailAuthForm mode="signup" nextPath={next} />
        <p className="mt-3 text-center text-[11px] text-muted">
          Already have an account?{" "}
          <Link href={`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </SectionCard>
    </div>
  );
}
