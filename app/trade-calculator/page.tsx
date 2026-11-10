import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { TradeCalculator } from "@/components/trade/trade-calculator";

export const metadata: Metadata = { title: "Trade Calculator" };

export default function TradeCalculatorPage() {
  return (
    <main id="main-content" className="rankings-page trade-page page-width">
      <Link href="/#playbook" className="back-link">
        ← Back to the playbook
      </Link>
      <header className="rankings-heading">
        <div>
          <p className="eyebrow">MAKE YOUR MOVE</p>
          <h1>Trade Calculator</h1>
          <p>Weigh the value. See how the deal fits both teams.</p>
        </div>
        <span className="feature-icon icon-trade">
          <Icon name="trade" />
        </span>
      </header>
      <TradeCalculator />
    </main>
  );
}
