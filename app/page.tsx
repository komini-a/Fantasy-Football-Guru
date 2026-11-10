import { FeatureCard } from "@/components/feature-card";
import { Icon } from "@/components/icon";
import { PlayDiagram } from "@/components/play-diagram";
import { features } from "@/lib/features";

export default function HomePage() {
  return (
    <main id="main-content">
      <section className="hero">
        <div className="hero-inner page-width">
          <div className="hero-copy">
            <p className="eyebrow hero-label">
              <span /> YOUR SEASON. YOUR STRATEGY.
            </p>
            <p className="hero-app-name">Fantasy Football Guru</p>
            <h1>
              Great seasons
              <br />
              start with
              <br />
              <em>smarter moves.</em>
            </h1>
            <p className="hero-description">
              Less second-guessing. More game-winning decisions. Your next
              advantage starts with a better playbook.
            </p>
            <a href="#playbook" className="button">
              Explore the playbook <Icon name="arrow" />
            </a>
            <p className="hero-footnote">
              A fresh perspective for every fantasy manager.
            </p>
          </div>
          <PlayDiagram />
        </div>
        <div className="hero-baseline page-width">
          <span>THINK AHEAD. PLAY WITH PURPOSE.</span>
          <span>
            FANTASY FOOTBALL, SIMPLIFIED <span aria-hidden="true">✳</span>
          </span>
        </div>
      </section>
      <section
        id="playbook"
        className="playbook page-width"
        aria-labelledby="playbook-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">BUILD YOUR ADVANTAGE</p>
            <h2 id="playbook-title">One playbook. Every angle.</h2>
          </div>
          <p>
            A few good tools.
            <br />A whole new way to see your team.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.href}
              feature={feature}
              number={index + 1}
            />
          ))}
        </div>
        <div className="coming-soon">
          <span className="coming-soon-symbol" aria-hidden="true">
            ✳
          </span>
          <div>
            <h3>More Coming Soon</h3>
            <p>
              The playbook is just getting started. There’s more on the horizon.
            </p>
          </div>
          <span className="coming-soon-label">
            ROOM TO GROW <span aria-hidden="true">↗</span>
          </span>
        </div>
      </section>
    </main>
  );
}
