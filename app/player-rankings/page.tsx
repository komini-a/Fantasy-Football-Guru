import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { RankingsBrowser } from "@/components/rankings/rankings-browser";

export const metadata: Metadata = { title: "Player Rankings" };

export default function PlayerRankingsPage() {
  return (
    <main id="main-content" className="rankings-page page-width">
      <Link href="/#playbook" className="back-link">
        ← Back to the playbook
      </Link>
      <header className="rankings-heading">
        <div>
          <p className="eyebrow">KNOW THE FIELD</p>
          <h1>Player Rankings</h1>
          <p>The season’s standouts, ranked by total fantasy points.</p>
        </div>
        <span className="feature-icon icon-rankings">
          <Icon name="rankings" />
        </span>
      </header>
      <RankingsBrowser />
    </main>
  );
}
