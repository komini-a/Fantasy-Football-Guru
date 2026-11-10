import { formatPoints } from "@/lib/rankings";
import type { TradeResult } from "@/lib/trade/evaluation";
import { MODEL } from "@/lib/trade/config";

export function TradeResults({ result }: { result: TradeResult }) {
  return (
    <section
      className="trade-panel trade-results"
      aria-label="Trade results"
      aria-live="polite"
    >
      <div className="trade-section-heading">
        <h2>The trade, from both sides</h2>
        <span>03 / Evaluation</span>
      </div>
      <div className="trade-fairness">
        <strong>{result.fairness}</strong>
        <p>
          {formatPoints(result.gap * 100)}% package-adjusted gap
          {result.favoredTeam && result.gap > MODEL.fairnessBalanced
            ? ` · Value favors ${result.favoredTeam}`
            : ""}
        </p>
      </div>
      <div className="trade-results-grid">
        {result.teams.map((team, index) => (
          <article key={index}>
            <div className="trade-grade-heading">
              <h3>{index === 0 ? "Your Team" : "Other Team"}</h3>
              <span className="trade-grade" aria-label={`Grade ${team.grade}`}>
                {team.grade}
              </span>
            </div>
            <dl className="trade-result-totals">
              <div>
                <dt>Value sent</dt>
                <dd>{formatPoints(team.sent)}</dd>
              </div>
              <div>
                <dt>Value received</dt>
                <dd>{formatPoints(team.received)}</dd>
              </div>
              <div>
                <dt>Adjusted sent</dt>
                <dd>{formatPoints(team.adjustedSent)}</dd>
              </div>
              <div>
                <dt>Adjusted received</dt>
                <dd>{formatPoints(team.adjustedReceived)}</dd>
              </div>
            </dl>
            <ul className="trade-explanations">
              {team.explanations.map((explanation) => (
                <li key={explanation}>{explanation}</li>
              ))}
            </ul>
            {team.before && team.after && (
              <details className="trade-details">
                <summary>Starting lineup before & after</summary>
                <div className="trade-lineup-comparison">
                  {[
                    { title: "Before", roster: team.before },
                    { title: "After", roster: team.after },
                  ].map(({ title, roster }) => (
                    <div key={title}>
                      <h4>
                        {title} · {formatPoints(roster.starterPoints)} pts/week
                      </h4>
                      <ul>
                        {roster.starters.map((starter) => (
                          <li key={starter.playerId}>
                            <span>
                              {starter.slot} · {starter.name}
                            </span>
                            <strong>{formatPoints(starter.points)}</strong>
                          </li>
                        ))}
                        {roster.holes.map((slot, hole) => (
                          <li key={`hole-${hole}`}>{slot} · Unfilled</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
      </div>
      <p className="trade-help">
        Fairness compares value exchanged; grades measure each team’s benefit. A
        balanced trade can improve both lineups. Adjusted package value = (sum
        of asset values^{MODEL.packageExponent})^(1/{MODEL.packageExponent});
        this discounts quantity on both sides. Grades and starter estimates are
        provisional.
      </p>
    </section>
  );
}
