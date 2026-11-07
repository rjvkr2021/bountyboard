import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, SectionCard } from "@/components/ui";

export const metadata: Metadata = {
  title: "Docs | BountyBoard",
  description: "User guides for launching, browsing, and participating in BountyBoard repositories.",
};

const linkClass = "text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent";

const contents = [
  ["overview", "Overview"],
  ["quick-start", "Quick start"],
  ["launch", "Launch a board"],
  ["browse", "Browse and read"],
  ["accounts", "Accounts and login"],
  ["identity", "Link GitHub and NEAR"],
  ["contribute", "Contribute to an issue"],
  ["promotion", "Maintainer and council"],
  ["status", "Status and indexing"],
  ["safety", "Safety and custody"],
  ["faq", "FAQ"],
] as const;

function Step({ number, title, children }: { number: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground font-mono text-[11px] font-semibold text-white">
        {number}
      </span>
      <div className="min-w-0 space-y-1">
        <p className="text-xs font-semibold">{title}</p>
        <div className="text-xs leading-5 text-muted">{children}</div>
      </div>
    </div>
  );
}

function Note({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return (
    <div className={`rounded-xl border p-3 text-xs leading-5 ${tone === "warn" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-line bg-background text-muted"}`}>
      {children}
    </div>
  );
}

function DiagramFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <figure className="space-y-2">
      <div className="overflow-x-auto rounded-2xl border border-line bg-background p-4">
        <div className="min-w-[720px]">{children}</div>
      </div>
      <figcaption className="text-[11px] text-muted">{label}</figcaption>
    </figure>
  );
}

function StatusRow({ status, meaning }: { status: string; meaning: string }) {
  return (
    <div className="grid gap-1 border-b border-line py-2 text-xs last:border-b-0 sm:grid-cols-[180px_1fr]">
      <span className="font-mono text-[11px] text-foreground">{status}</span>
      <span className="text-muted">{meaning}</span>
    </div>
  );
}

function PlatformDiagram() {
  return (
    <svg width="840" height="260" viewBox="0 0 840 260" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="BountyBoard platform architecture">
      <defs><marker id="docs-arrow-platform" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0 0L6 3L0 6Z" fill="var(--accent)" /></marker></defs>
      <text x="24" y="30" fontFamily="var(--font-sans)" fontSize="10" fontWeight="600" letterSpacing="1.8" fill="var(--muted)">PLATFORM MAP</text>
      <text x="816" y="30" textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="var(--muted)">one board per repository</text>
      <line x1="24" y1="52" x2="816" y2="52" stroke="var(--line)" />
      <circle cx="24" cy="52" r="3" fill="var(--accent)" />
      <circle cx="230" cy="52" r="3" fill="var(--accent)" />
      <circle cx="455" cy="52" r="3" fill="var(--accent)" />
      <circle cx="680" cy="52" r="3" fill="var(--accent)" />
      <text x="24" y="82" fontFamily="var(--font-mono)" fontSize="10" fontWeight="500" letterSpacing="1.2" fill="var(--accent)">01 / SOURCE</text>
      <text x="24" y="108" fontFamily="var(--font-sans)" fontSize="16" fontWeight="600" fill="var(--foreground)">GitHub repository</text>
      <text x="24" y="130" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Issues, pull requests,</text>
      <text x="24" y="147" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">admins, and advisories</text>
      <text x="24" y="204" fontFamily="var(--font-mono)" fontSize="10" fill="var(--muted)">github.com/owner/repo</text>
      <line x1="184" y1="145" x2="216" y2="145" markerEnd="url(#docs-arrow-platform)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="230" y="82" fontFamily="var(--font-mono)" fontSize="10" fontWeight="500" letterSpacing="1.2" fill="var(--accent)">02 / LAUNCH</text>
      <text x="230" y="108" fontFamily="var(--font-sans)" fontSize="16" fontWeight="600" fill="var(--foreground)">Launch service</text>
      <text x="230" y="130" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Verify admin access</text>
      <text x="230" y="147" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Create DAO, board, oracle</text>
      <text x="230" y="164" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Hand off council control</text>
      <line x1="410" y1="145" x2="442" y2="145" markerEnd="url(#docs-arrow-platform)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="455" y="82" fontFamily="var(--font-mono)" fontSize="10" fontWeight="500" letterSpacing="1.2" fill="var(--accent)">03 / PER-REPO STACK</text>
      <rect x="455" y="92" width="180" height="132" rx="14" fill="var(--panel)" stroke="var(--line)" />
      <rect x="455" y="92" width="5" height="132" rx="2.5" fill="var(--accent-soft)" />
      <text x="475" y="114" fontFamily="var(--font-sans)" fontSize="12.5" fontWeight="600" fill="var(--foreground)">DAO treasury</text>
      <text x="475" y="130" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Funds and policy</text>
      <line x1="475" y1="140" x2="615" y2="140" stroke="var(--line)" />
      <text x="475" y="159" fontFamily="var(--font-sans)" fontSize="12.5" fontWeight="600" fill="var(--foreground)">BountyBoard</text>
      <text x="475" y="175" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Issues, proofs, payouts</text>
      <line x1="475" y1="185" x2="615" y2="185" stroke="var(--line)" />
      <text x="475" y="204" fontFamily="var(--font-sans)" fontSize="12.5" fontWeight="600" fill="var(--foreground)">Oracle</text>
      <text x="475" y="219" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Signs merge + identity</text>
      <line x1="635" y1="145" x2="667" y2="145" markerEnd="url(#docs-arrow-platform)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="680" y="82" fontFamily="var(--font-mono)" fontSize="10" fontWeight="500" letterSpacing="1.2" fill="var(--accent)">04 / APP</text>
      <text x="680" y="108" fontFamily="var(--font-sans)" fontSize="16" fontWeight="600" fill="var(--foreground)">Product</text>
      <text x="680" y="130" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Directory</text>
      <text x="680" y="147" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Repo and issue pages</text>
      <text x="680" y="164" fontFamily="var(--font-sans)" fontSize="11.5" fill="var(--muted)">Contribution + governance</text>
      <line x1="24" y1="232" x2="816" y2="232" stroke="var(--line)" />
      <text x="24" y="249" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--muted)">SOLID = CONTROL FLOW</text>
      <text x="816" y="249" textAnchor="end" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--muted)">ACCENT = OWNERSHIP HANDOFF</text>
    </svg>
  );
}

function LifecycleDiagram() {
  return (
    <svg width="840" height="220" viewBox="0 0 840 220" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bounty lifecycle from discovery to payout">
      <text x="24" y="28" fontFamily="var(--font-sans)" fontSize="10" fontWeight="600" letterSpacing="1.8" fill="var(--muted)">BOUNTY LIFECYCLE</text>
      <text x="816" y="28" textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="var(--muted)">discovery → settlement</text>
      <line x1="40" y1="105" x2="800" y2="105" stroke="var(--accent)" strokeWidth="1.5" />
      <circle cx="70" cy="105" r="13" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="70" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="500" fill="var(--accent)">01</text>
      <circle cx="208" cy="105" r="13" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="208" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="500" fill="var(--accent)">02</text>
      <circle cx="346" cy="105" r="13" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="346" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="500" fill="var(--accent)">03</text>
      <circle cx="484" cy="105" r="13" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="484" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="500" fill="var(--accent)">04</text>
      <circle cx="622" cy="105" r="13" fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="622" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="500" fill="var(--accent)">05</text>
      <circle cx="760" cy="105" r="15" fill="var(--accent)" stroke="var(--accent)" strokeWidth="1.5" />
      <text x="760" y="109" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="10.5" fontWeight="500" fill="var(--panel)">06</text>
      <text x="70" y="64" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Discover</text>
      <text x="70" y="82" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Open bounty</text>
      <text x="208" y="143" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Claim</text>
      <text x="208" y="161" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Wallet tx</text>
      <text x="346" y="64" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Build</text>
      <text x="346" y="82" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Pull request</text>
      <text x="484" y="143" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Approve</text>
      <text x="484" y="161" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Maintainer vote</text>
      <text x="622" y="64" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Prove</text>
      <text x="622" y="82" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Merge verified</text>
      <text x="760" y="143" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Receive</text>
      <text x="760" y="161" textAnchor="middle" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">DAO payout</text>
      <line x1="24" y1="190" x2="816" y2="190" stroke="var(--line)" />
      <text x="24" y="207" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--muted)">WALLET-SIGNED: CLAIM, APPROVE, PAYOUT</text>
      <text x="816" y="207" textAnchor="end" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--muted)">ORACLE: MERGE PROOF</text>
    </svg>
  );
}

function RoleDiagram() {
  return (
    <svg width="840" height="240" viewBox="0 0 840 240" className="h-auto w-full" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Contributor progression to maintainer and council">
      <text x="24" y="28" fontFamily="var(--font-sans)" fontSize="10" fontWeight="600" letterSpacing="1.8" fill="var(--muted)">ROLE PROGRESSION</text>
      <text x="816" y="28" textAnchor="end" fontFamily="var(--font-mono)" fontSize="10" fill="var(--muted)">earned on-chain</text>
      <path d="M24 212H207V192H410V172H613V152H816" fill="none" stroke="var(--accent-soft)" strokeWidth="2" />
      <rect x="24" y="124" width="183" height="88" rx="14" fill="var(--panel)" stroke="var(--line)" />
      <circle cx="42" cy="144" r="10" fill="var(--accent-soft)" />
      <text x="42" y="148" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fontWeight="500" fill="var(--accent)">01</text>
      <text x="42" y="170" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Contributor</text>
      <text x="42" y="190" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Claim + complete</text>
      <text x="42" y="204" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Build reputation</text>
      <rect x="227" y="104" width="183" height="88" rx="14" fill="var(--panel)" stroke="var(--line)" />
      <circle cx="245" cy="124" r="10" fill="var(--accent-soft)" />
      <text x="245" y="128" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fontWeight="500" fill="var(--accent)">02</text>
      <text x="245" y="150" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Candidate</text>
      <text x="245" y="170" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">1 S0 · 2 S1 · 3 S2 · 4 S3</text>
      <text x="245" y="184" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Tier-count promotion</text>
      <rect x="430" y="84" width="183" height="88" rx="14" fill="var(--panel)" stroke="var(--line)" />
      <circle cx="448" cy="104" r="10" fill="var(--accent-soft)" />
      <text x="448" y="108" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fontWeight="500" fill="var(--accent)">03</text>
      <text x="448" y="130" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Maintainer</text>
      <text x="448" y="150" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Promote after challenge</text>
      <text x="448" y="164" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Approve + maintain</text>
      <rect x="633" y="64" width="183" height="88" rx="14" fill="var(--panel)" stroke="var(--accent)" />
      <circle cx="651" cy="84" r="10" fill="var(--accent)" />
      <text x="651" y="88" textAnchor="middle" fontFamily="var(--font-mono)" fontSize="9.5" fontWeight="500" fill="var(--panel)">04</text>
      <text x="651" y="110" fontFamily="var(--font-sans)" fontSize="13.5" fontWeight="600" fill="var(--foreground)">Council</text>
      <text x="651" y="130" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">Tier involvement</text>
      <text x="651" y="144" fontFamily="var(--font-sans)" fontSize="10.5" fill="var(--muted)">DAO vote</text>
      <line x1="24" y1="222" x2="816" y2="222" stroke="var(--line)" />
      <text x="24" y="236" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--muted)">ELIGIBILITY IS DETECTED FROM SETTLED PAYOUTS</text>
      <text x="816" y="236" textAnchor="end" fontFamily="var(--font-mono)" fontSize="9.5" fill="var(--muted)">COUNCIL CONTROL IS A DAO DECISION</text>
    </svg>
  );
}

export default function DocsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Documentation"
        title="How BountyBoard works"
        description="Launch a verifiable bounty board for a GitHub repository, browse funded issues, and follow the path from contributor to maintainer and council member."
      >
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[210px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-line bg-panel p-3">
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">On this page</p>
            <nav className="mt-2 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
              {contents.map(([id, label]) => (
                <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-lg px-2 py-1.5 text-xs text-muted transition hover:bg-background hover:text-foreground">
                  {label}
                </a>
              ))}
            </nav>
          </div>
          <div className="mt-3 rounded-2xl border border-line bg-panel p-3 text-[11px] leading-5 text-muted">
            <p className="font-semibold text-foreground">Build status</p>
            <p className="mt-1">Accounts, board launch, identity linking, contribution actions, promotion actions, and read pages are live.</p>
          </div>
        </aside>

        <div className="min-w-0 space-y-5">
          <SectionCard id="overview" title="What BountyBoard is" description="One repository, one treasury, one verifiable record.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <p>
                BountyBoard gives an open-source repository its own funding and payout system. Each launched repository gets a Sputnik DAO, a BountyBoard contract, and a scoped oracle account. The DAO holds funds. The board records bounties, approvals, claims, proofs, and payout requests. The oracle signs evidence such as merge proofs and identity links.
              </p>
              <p>
                The app is the discovery and operating layer: it verifies repository ownership, runs the launch, lists repositories, shows board state, and documents the rules. It is not a custodian and does not hold treasury funds.
              </p>
              <DiagramFrame label="Each repository gets its own DAO, board, and oracle. The platform app reads and operates the deployment.">
                <PlatformDiagram />
              </DiagramFrame>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">DAO</p>
                  <p className="mt-1">Holds the treasury and controls policy changes.</p>
                </div>
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">Board</p>
                  <p className="mt-1">Tracks bounties, approvals, claims, proofs, and payouts.</p>
                </div>
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">Oracle</p>
                  <p className="mt-1">Signs merge and security evidence for the board.</p>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="quick-start" title="Quick start" description="What you can do today.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <div className="space-y-3">
                <Step number="1" title="Sign in with GitHub">
                  Open <Link href="/signin" className={linkClass}>Sign in</Link> with email and password or GitHub. Accounts own the repositories they list and can manage them from the account page. GitHub is required for bounty contribution proof.
                </Step>
                <Step number="2" title="Link a NEAR account">
                  Open <Link href="/account#identity" className={linkClass}>Account → Identity</Link>, connect a NEAR wallet, and sign the NEP-413 link message. The oracle writes the link to each active board.
                </Step>
                <Step number="3" title="Launch a board">
                  Open <Link href="/launch" className={linkClass}>Launch</Link> when your GitHub account has admin access to a public repository and a NEAR deployer is configured. The launch is a real deployment, not a simulation.
                </Step>
                <Step number="4" title="Contribute to a bounty">
                  Open an issue, claim it with your NEAR wallet, submit the merged pull request, and request payout after approvals. Maintainers can approve from the same issue page.
                </Step>
                <Step number="5" title="Check platform health">
                  Open <Link href="/status" className={linkClass}>Status</Link> to see missing configuration, indexer cursors, and recent events.
                </Step>
              </div>
              <Note>
                You can sign in with GitHub, link a NEAR account, launch a board, contribute to approved bounties, and manage maintainer/council promotion today.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="launch" title="Launch a board" description="Create the DAO, board, and oracle for a repository.">
            <div className="space-y-5 text-xs leading-6 text-muted">
              <p>
                A repository admin launches the board. The launch service verifies GitHub admin access, creates three subaccounts under the platform root, deploys the contracts, initializes policy, and transfers council control to the NEAR account linked to the signed-in GitHub identity.
              </p>
              <div className="rounded-xl border border-line bg-background p-3">
                <p className="font-semibold text-foreground">Before you launch</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>A BountyBoard session. <Link href="/signin" className={linkClass}>Sign in with GitHub</Link>.</li>
                  <li>Admin access to a public GitHub repository. Eligible repositories are listed automatically.</li>
                  <li>A founder NEAR account with enough balance to fund the launch. The founder wallet transfers the launch amount to the deployer.</li>
                  <li><code className="font-mono text-[11px]">PLATFORM_BOARD_WASM</code> and <code className="font-mono text-[11px]">PLATFORM_SPUTNIK_WASM</code> paths.</li>
                  <li><code className="font-mono text-[11px]">PLATFORM_ORACLE_PUBLIC_KEY</code> for the new oracle account.</li>
                  <li>A linked GitHub↔NEAR identity. The linked NEAR account must exist on-chain and receives council control.</li>
                </ul>
              </div>
              <div className="space-y-3">
                <Step number="1" title="Open the launch form">
                  Go to <Link href="/launch" className={linkClass}>/launch</Link>. You must be signed in; the board is attached to your account.
                </Step>
                <Step number="2" title="Select the repository">
                  Choose a public repository from the list. The optional slug must be 3-32 lowercase letters, numbers, or hyphens. The founder is derived from your linked NEAR identity.
                </Step>
                <Step number="3" title="Set the initial DAO budget and cap">
                  The initial budget is transferred into the DAO and set as the board budget. The daily cap limits spending per day. Both are written into the launch flow.
                </Step>
                <Step number="4" title="Fund and launch">
                  The app checks that your linked NEAR account exists and shows the exact launch funding amount. Your founder wallet transfers that amount to the deployer, the server verifies the funding transaction, and deployment starts. The board is active only after all deployment steps and the policy handoff complete.
                </Step>
              </div>
              <DiagramFrame label="What launch creates. The deployer keeps no ongoing custody after the council handoff.">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-line bg-panel p-3">
                    <p className="font-mono text-[11px] text-foreground">&lt;slug&gt;-dao.&lt;root&gt;</p>
                    <p className="mt-1">Sputnik DAO. Treasury, council, policy, proposals.</p>
                  </div>
                  <div className="rounded-xl border border-line bg-panel p-3">
                    <p className="font-mono text-[11px] text-foreground">&lt;slug&gt;-board.&lt;root&gt;</p>
                    <p className="mt-1">BountyBoard. Bounties, approvals, claims, proofs, payouts.</p>
                  </div>
                  <div className="rounded-xl border border-line bg-panel p-3">
                    <p className="font-mono text-[11px] text-foreground">&lt;slug&gt;-oracle.&lt;root&gt;</p>
                    <p className="mt-1">Oracle. Signs merge and identity evidence for this board.</p>
                  </div>
                </div>
              </DiagramFrame>
              <Note tone="warn">
                A live testnet launch has completed for `rjvkr2021/bountyboard_test_repo`. The adapter still has no rollback, resume, or idempotency flow, so verify account/key cleanup before treating a launch as production-ready.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="browse" title="Browse and read a board" description="Understand the directory, repository page, and issue page.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <div className="space-y-3">
                <p><span className="font-semibold text-foreground">Directory.</span> The home page lists every launched board with its deployment status, verification source, issue count, paid total, contributor count, and current budget.</p>
                <p><span className="font-semibold text-foreground">Repository page.</span> <code className="font-mono text-[11px]">/r/&lt;slug&gt;</code> shows the board accounts, verification source, maintainers, issues, recent indexed events, and whether the board is paused.</p>
                <p><span className="font-semibold text-foreground">Issue page.</span> <code className="font-mono text-[11px]">/r/&lt;slug&gt;/issues/&lt;issueId&gt;</code> shows the amount, tier, status, claims, approvals, completion proof, security disclosure details, and issue events.</p>
                <p><span className="font-semibold text-foreground">Status page.</span> <code className="font-mono text-[11px]">/status</code> shows runtime configuration, missing production inputs, indexer cursors, recent events, and a manual indexer tick button.</p>
              </div>
              <div className="rounded-xl border border-line bg-background p-3">
                <p className="font-semibold text-foreground">Reading the badges</p>
                <div className="mt-2 space-y-0">
                  <StatusRow status="pending / verifying / deploying" meaning="Launch is in progress. Do not treat the board as active yet." />
                  <StatusRow status="active" meaning="Deployment completed and the board is being read by the app." />
                  <StatusRow status="failed / retired" meaning="Launch or operation failed, or the board was retired." />
                  <StatusRow status="github_app" meaning="Repository ownership was verified through GitHub admin access." />
                  <StatusRow status="legacy" meaning="Metadata was written without a verification source. Treat it as legacy data." />
                  <StatusRow status="council / promoted" meaning="A maintainer is council-derived, independently promoted, or both." />
                </div>
              </div>
              <Note>
                The app exposes public bounty creation (S0–S3), budget proposals, cancellation, private-security creation/approval/disclosure/payout, claim, maintainer approval, merge-proof submission, payout requests, and the S0 native-bounty settlement flow. Private S0 is not exposed yet.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="accounts" title="Accounts and login" description="Email/password and GitHub sign-in backed by Better Auth and Postgres.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <p>
                Sign in at <Link href="/signin" className={linkClass}>/signin</Link> with email and password or GitHub. Email/password accounts can browse and manage their account, and can connect GitHub later from <Link href="/account#identity" className={linkClass}>Account → Identity</Link>. GitHub is required to claim and verify bounty work. Better Auth stores users, linked provider accounts, and sessions in Postgres. Sessions use HTTP-only cookies and expire after seven days by default.
              </p>
              <p>
                An account owns the repositories it lists and can review them at <Link href="/account" className={linkClass}>/account</Link>. You can browse the directory, repository pages, docs, and status without an account.
              </p>
              <div className="space-y-3">
                <Step number="1" title="Create an account or continue with GitHub">
                  Sign up with email and password, or authorize the BountyBoard GitHub OAuth app. GitHub is required for repository admin checks and bounty contribution proof.
                </Step>
                <Step number="2" title="Manage your account">
                  Open <Link href="/account" className={linkClass}>/account</Link> to see your repositories, launch a board, or sign out.
                </Step>
              </div>
              <Note tone="warn">
                GitHub OAuth proves your identity and the app uses your stored session to verify repository admin access. Account deletion and multi-factor controls are not implemented yet.
              </Note>
              <Note>
                GitHub and NEAR identities are separate. A BountyBoard session proves your GitHub account; the NEP-413 signature proves control of the linked NEAR account. Use <Link href="/account#identity" className={linkClass}>Account → Identity</Link> to create or remove the link.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="identity" title="Link GitHub and NEAR" description="Connect a GitHub identity to a NEAR account for attribution.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <p>
                A link lets the oracle attribute a merged pull request or security disclosure to the right NEAR account. The GitHub numeric user ID is the canonical identifier; handles can change and be reused. The oracle writes the link into every active board.
              </p>
              <p>
                Open <Link href="/account#identity" className={linkClass}>Account → Identity</Link> to link, change, or unlink the account. Linking and changing verify your GitHub session, ask the NEAR wallet for a NEP-413 signature, verify that signature on-chain through RPC, and then submit the oracle write. Unlinking only needs your signed-in GitHub session, so it never reopens the wallet connector.
              </p>
              <div className="space-y-3">
                <Step number="1" title="Sign in with GitHub">
                  Authorize GitHub and confirm the login shown by the app.
                </Step>
                <Step number="2" title="Connect a NEAR account">
                  Connect the wallet that should receive payouts and reputation.
                </Step>
                <Step number="3" title="Sign the link message">
                  Sign the NEP-413 message containing the GitHub identity and the NEAR account. This proves both sides without sharing a private key.
                </Step>
                <Step number="4" title="Oracle writes the link">
                  The oracle submits <code className="font-mono text-[11px]">link_identity_with_id</code> for each active board. Your identity page then shows your own link; the app does not publish a link directory.
                </Step>
              </div>
              <div className="rounded-xl border border-line bg-background p-3">
                <p className="font-semibold text-foreground">Rules</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>One GitHub identity maps to one NEAR account at a time.</li>
                  <li>One NEAR account cannot be linked to multiple GitHub identities.</li>
                  <li>Numeric GitHub IDs survive handle renames; handles alone are not stable.</li>
                  <li>Changing the linked account requires a fresh NEP-413 signature. Unlinking only requires your signed-in GitHub session; changing or re-linking after an unlink is limited by the platform cooldown.</li>
                </ul>
              </div>
              <Note>
                The default re-link cooldown is 24 hours. Operators can change it with
                <code className="ml-1 font-mono text-[11px]">PLATFORM_IDENTITY_RELINK_COOLDOWN_SECS</code>.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="contribute" title="Contribute to an issue" description="Claim a bounty, submit merged work, and request payout.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <p>
                Open an issue page to claim a bounty with your NEAR wallet. Maintainers approve on the same page, signed-in contributors submit the merged pull request, and the payout request settles through the DAO.
              </p>
              <DiagramFrame label="The on-chain lifecycle. Claim, approval, merge proof, and payout request are exposed in the app.">
                <LifecycleDiagram />
              </DiagramFrame>
              <div className="space-y-3">
                <Step number="1" title="Create a bounty">
                  A maintainer opens the repository page, enters the GitHub issue number, tier, amount, and optional intended contributor, then signs <code className="font-mono text-[11px]">create_bounty</code>. The app verifies the GitHub issue is open before submitting.
                </Step>
                <Step number="2" title="Find a bounty">
                  Open a repository page and read the issue amount, tier, status, claimants, and approvals. Do not start work on an issue that is cancelled or already settled.
                </Step>
                <Step number="3" title="Claim it">
                  Connect your NEAR wallet and submit the claim transaction. The board limits claims and rejects private-security claims.
                </Step>
                <Step number="4" title="Do the work">
                  Open a pull request against the repository. Reference the issue so the app can verify the work belongs to this bounty. The PR must be authored by your signed-in GitHub account.
                </Step>
                <Step number="5" title="Get approval">
                  A maintainer connects a wallet and approves according to the tier. The bounty must be approved before merge proof can be recorded.
                </Step>
                <Step number="6" title="Record merge proof">
                  After the PR is merged, submit its pull request number on the issue page. The server verifies the merge through GitHub REST, checks the author and issue reference, and the oracle records the merge proof on-chain.
                </Step>
                <Step number="7" title="Request payout">
                  The wallet calls <code className="font-mono text-[11px]">request_payout</code>. New boards fund a payout bond reserve, so the board covers the DAO proposal bond; legacy boards may require the bond to be attached. The board creates and auto-votes the DAO proposal, and the contributor receives the payout when it executes.
                </Step>
              </div>
              <div className="rounded-xl border border-line bg-background p-3">
                <p className="font-semibold text-foreground">Approval rules by tier</p>
                <div className="mt-2 space-y-0">
                  <StatusRow status="S0" meaning="No maintainer approval; DAO proposal or native bounty flow." />
                  <StatusRow status="S1" meaning="Two distinct maintainer approvals." />
                  <StatusRow status="S2" meaning="One maintainer approval." />
                  <StatusRow status="S3" meaning="One maintainer approval; higher-risk work." />
                </div>
                <p className="mt-2 text-[11px]">The contract is the source of truth. Self-dealing, conflicts, and council resolution rules still apply.</p>
              </div>
              <Note>
                The payout request requires a linked GitHub↔NEAR identity for the merged PR author. New boards cover the DAO proposal bond from their reserve; legacy boards may attach the bond. Use <span className="font-semibold text-foreground">Refresh chain state</span> after a wallet transaction if the page has not caught up.
              </Note>
              <Note tone="warn">
                S0 is exposed through its own native settlement panel. Creating an S0 bounty creates an AddBounty proposal; a council member votes, the native bounty is registered, the claimant claims it, and after merge proof the BountyDone proposal is recorded and the payout confirmed. Private security bounties are created from a GHSA ID, stay hidden from public lists, are approved by maintainers, disclosed with the credited researcher and advisory URL, and paid to the researcher’s linked NEAR account. Private S0 is not exposed yet.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="promotion" title="Become a maintainer, then a council member" description="Reputation and governance progression.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <DiagramFrame label="Role progression. Eligibility is detected from closed-PR tier counts.">
                <RoleDiagram />
              </DiagramFrame>
              <p>
                Open a repository page and use the Governance panel. Connect your NEAR wallet to see
                your closed-PR tier counts, candidate status, maintainer involvement, and council requests.
              </p>
              <div className="space-y-4">
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">Maintainer</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>At least 1 S0, 2 S1, 3 S2, and 4 S3 closed PRs.</li>
                    <li>The contract creates a candidate automatically after all four tier thresholds are met.</li>
                    <li>After the candidate challenge period, any wallet can promote the candidate. The DAO may veto during the challenge.</li>
                    <li>A council member can promote any account directly to maintainer.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">Council member</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Become a maintainer first.</li>
                    <li>Be involved in at least 2 S0, 4 S1, 6 S2, and 8 S3 closed PRs. Own payouts and maintainer approvals both count.</li>
                    <li>Request council promotion. The board creates a DAO proposal to add your account to the council role.</li>
                    <li>A council member votes approve on the repository page, then sync the request and council roster.</li>
                    <li>A council member can also start a council proposal for any account directly.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">Council powers</p>
                  <p className="mt-1">Council members control the DAO, vote on policy and treasury proposals, and are treated as maintainers. They can promote any account to maintainer directly, or start a DAO proposal to add any account to the council role. Council-derived maintainers are removed when they leave the council unless they were independently promoted.</p>
                </div>
              </div>
              <Note>
                Candidate promotion is permissionless once the challenge ends. The app shows council
                vote and sync actions; the full DAO proposal inbox, veto proposals, rejection
                handling, and notifications remain external.
              </Note>
            </div>
          </SectionCard>

          <SectionCard id="status" title="Status and indexing" description="How the app learns about on-chain state.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <p>
                The indexer reconciles board state from NEAR RPC. It reads the repository, budget, issue list, and latest final block, compares those snapshots with the local store, and records changes. It is a state reconciliation loop, not an event-log consumer.
              </p>
              <p>
                Use <Link href="/status" className={linkClass}>/status</Link> to see the current network, root account, data file, missing launch configuration, active deployments, cursors, and recent events. The <span className="font-semibold text-foreground">Run indexer tick</span> button triggers one pass.
              </p>
              <div className="rounded-xl border border-line bg-background p-3">
                <p className="font-semibold text-foreground">Current limits</p>
                <ul className="mt-2 list-disc space-y-1 pl-4">
                  <li>Final-block RPC polling only; no Lake stream, backfill, or reorg rewind.</li>
                  <li>No GitHub issue, pull request, advisory, or webhook ingestion.</li>
                  <li>No DAO proposal inbox or automatic maintainer reconciliation.</li>
                  <li>JSON storage is single-process and intended for local development.</li>
                </ul>
              </div>
            </div>
          </SectionCard>

          <SectionCard id="safety" title="Safety and custody" description="What the platform can and cannot do.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">What the platform controls</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>Launch orchestration and initial account creation.</li>
                    <li>Repository verification through GitHub admin access.</li>
                    <li>The public read model and directory.</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-line bg-background p-3">
                  <p className="font-semibold text-foreground">What the platform does not control</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4">
                    <li>DAO treasury funds after handoff.</li>
                    <li>Board approvals and payout policy.</li>
                    <li>Your wallet or private keys.</li>
                  </ul>
                </div>
              </div>
              <ul className="list-disc space-y-1 pl-4">
                <li>Never share a seed phrase or private key. The app never needs one.</li>
                <li>The GitHub OAuth session uses the public_repo scope. It is not exposed to the browser, but it is still a powerful credential.</li>
                <li>Production must use KMS for deployer and oracle keys. The current environment-key path is local-development only.</li>
                <li>Keep public beta activity on testnet until the contract audit and incident-response plan are complete.</li>
                <li>The JSON store contains repository metadata and identity links. Back it up and restrict access in any shared environment.</li>
              </ul>
            </div>
          </SectionCard>

          <SectionCard id="faq" title="FAQ" description="Short answers to common questions.">
            <div className="space-y-4 text-xs leading-6 text-muted">
              <div>
                <p className="font-semibold text-foreground">Do I need an account to browse?</p>
                <p className="mt-1">No. Directory, repository, issue, status, and docs pages are public. The identity page is private to the signed-in owner. An account is required to list a repository or launch a board.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Can I sign up or log in today?</p>
                <p className="mt-1">Yes. Sign up or sign in with email and password. GitHub sign-in is also available and is required to claim and verify bounty work.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Can I connect GitHub to an email account?</p>
                <p className="mt-1">Yes. Open <Link href="/account#identity" className="text-accent hover:underline">Account → Identity</Link> and choose Connect GitHub. The GitHub account is linked explicitly while you are signed in; it is not merged implicitly by email.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Can I link GitHub to NEAR today?</p>
                <p className="mt-1">Yes. Open <Link href="/account#identity" className="text-accent hover:underline">Account → Identity</Link>, connect a NEAR wallet, and sign the NEP-413 message. A BountyBoard account remains separate from the GitHub↔NEAR link.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Can I claim or get paid from the app today?</p>
                <p className="mt-1">Yes. Maintainers can create public and private-security bounties, set the budget through a DAO proposal, cancel public bounties, and disclose private advisories. S0 uses the native settlement panel; private S0 is not exposed yet.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Where is the data stored?</p>
                <p className="mt-1">Better Auth users and sessions live in Postgres. Repository, board, and identity metadata currently live in <code className="font-mono text-[11px]">.data/platform.json</code>; move that remaining data to Postgres before running multiple app instances.</p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Who can change the board?</p>
                <p className="mt-1">The DAO controls policy and treasury. Maintainers approve work under that policy. The platform has no ongoing governance power after launch.</p>
              </div>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
