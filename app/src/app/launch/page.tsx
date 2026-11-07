import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LaunchForm } from "@/components/platform/launch-form";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Launch a board | BountyBoard",
};

export default async function LaunchPage() {
  const session = await getSession();
  if (!session) redirect("/signin?next=/launch");
  return <LaunchForm />;
}
