import Link from "next/link";
import { Icon } from "@/components/icon";
import type { Feature } from "@/lib/features";

export function FeatureCard({
  feature,
  number,
}: {
  feature: Feature;
  number: number;
}) {
  return (
    <Link
      href={feature.href}
      className="feature-card"
      aria-label={
        feature.available ? feature.title : `${feature.title} — coming soon`
      }
    >
      <div className="card-top">
        <span className={`feature-icon icon-${feature.icon}`}>
          <Icon name={feature.icon} />
        </span>
        <span className="card-number">0{number}</span>
      </div>
      <p className="eyebrow card-category">{feature.category}</p>
      <h3>{feature.title}</h3>
      <p className="card-description">{feature.description}</p>
      <div className="card-bottom">
        <span>{feature.available ? "Explore tool" : "Coming soon"}</span>
        <span className="card-arrow">
          <Icon name="arrow" />
        </span>
      </div>
    </Link>
  );
}
