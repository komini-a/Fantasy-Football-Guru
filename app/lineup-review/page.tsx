import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { LineupReview } from "@/components/lineup/lineup-review";

export const metadata: Metadata = { title: "Lineup Rating" };

export default function LineupReviewPage() {
  return (
    <main
      id="main-content"
      className="rankings-page trade-page lineup-page page-width"
    >
      <Link href="/#playbook" className="back-link">
        ← Back to the playbook
      </Link>
      <header className="rankings-heading">
        <div>
          <p className="eyebrow">SET YOURSELF UP</p>
          <h1>Lineup Rating</h1>
          <p>Your roster. Your league. An AI evaluation built around both.</p>
        </div>
        <span className="feature-icon icon-lineup">
          <Icon name="lineup" />
        </span>
      </header>
      <LineupReview />
    </main>
  );
}
