import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Feature } from "@/lib/features";

export function FeaturePlaceholder({ feature }: { feature: Feature }) {
  return (
    <main id="main-content" className="placeholder page-width">
      <Link href="/#playbook" className="back-link">
        ← Back to the playbook
      </Link>
      <div className="placeholder-panel">
        <span className="feature-icon">
          <Icon name={feature.icon} />
        </span>
        <p className="eyebrow">IN THE PLAYBOOK · COMING SOON</p>
        <h1>{feature.title}</h1>
        <p>{feature.description}</p>
        <p className="placeholder-note">
          We’re drawing up the play. This tool is still on the practice field
          and isn’t available yet.
        </p>
        <Link href="/#playbook" className="button button-dark">
          Explore the playbook <Icon name="arrow" />
        </Link>
      </div>
    </main>
  );
}
