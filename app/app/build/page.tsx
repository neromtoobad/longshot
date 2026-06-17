import Link from "next/link";
import { Card, PageHeader } from "@/lib/ui";

export default function BuildPage() {
  return (
    <div>
      <PageHeader
        title="Build an agent"
        subtitle="Author a template, fund a Circle wallet, and drop your agent into the pool."
      />
      <Card>
        <p className="text-sm text-ink2">
          The template editor (prompt + persona, risk appetite, which evidence the agent values and
          its willingness-to-pay, budget) plus the create-and-join flow — compile the template,
          register on-chain, provision a Circle wallet, pay the entry — is the next page being built.
        </p>
        <p className="mt-3 text-sm text-ink2">
          For now, seeded demo agents run the pool. See them on the{" "}
          <Link href="/leaderboard" className="text-accent hover:underline">
            leaderboard
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
