import { useEffect, useRef } from "react";
import {
  formatPoints,
  type RankedPlayer,
  type ScoringFormat,
} from "@/lib/rankings";

export function PlayerDetails({
  player,
  season,
  scoring,
  onClose,
}: {
  player: RankedPlayer;
  season: number;
  scoring: ScoringFormat;
  onClose: () => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [player.id]);
  const groups = ["Passing", "Rushing", "Receiving", "Other scoring"].filter(
    (group) =>
      group !== "Passing" ||
      player.position === "QB" ||
      player.stats.some((stat) => stat.group === group && stat.value !== 0),
  );
  return (
    <section
      id="player-details"
      className="player-details"
      aria-labelledby="player-details-title"
    >
      <div className="player-detail-heading">
        <div>
          <p className="eyebrow">SEASON SNAPSHOT · {season}</p>
          <h2 id="player-details-title" ref={heading} tabIndex={-1}>
            {player.name}
          </h2>
          <p className="player-meta">
            {player.position} <span aria-hidden="true">·</span> {player.team}{" "}
            <span aria-hidden="true">·</span> {scoring}
          </p>
        </div>
        <button
          type="button"
          className="detail-close"
          onClick={onClose}
          aria-label="Close player details"
        >
          Close <span aria-hidden="true">×</span>
        </button>
      </div>
      <dl className="player-totals">
        <div>
          <dt>Games played</dt>
          <dd>{player.gamesPlayed}</dd>
        </div>
        <div>
          <dt>Total fantasy points</dt>
          <dd>{formatPoints(player.totalPoints)}</dd>
        </div>
      </dl>
      <div className="stat-groups">
        {groups.map((group) => (
          <div key={group} className="stat-group">
            <h3>{group}</h3>
            <table>
              <thead>
                <tr>
                  <th scope="col">Statistic</th>
                  <th scope="col">Total</th>
                  <th scope="col">Points</th>
                </tr>
              </thead>
              <tbody>
                {player.stats
                  .filter((stat) => stat.group === group)
                  .map((stat) => (
                    <tr key={stat.label}>
                      <th scope="row">
                        {stat.label}
                        {stat.rate !== null && (
                          <small>{stat.rate} pts each</small>
                        )}
                      </th>
                      <td>{stat.value.toLocaleString("en-US")}</td>
                      <td>
                        {stat.points === null ? (
                          <span aria-label="Not scored">—</span>
                        ) : (
                          formatPoints(stat.points)
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      <p className="detail-note">
        Completed regular-season games only. All teams played for in this season
        are shown. Position reflects the latest appearance. A dash means the
        statistic is not scored.
      </p>
    </section>
  );
}
