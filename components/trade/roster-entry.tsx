import type { PlayerValue, Team, TradeData } from "@/lib/trade/types";
import { AssetSearch } from "./asset-search";

type Props = {
  name: string;
  team: Team;
  data: TradeData;
  values: Map<string, PlayerValue>;
  excluded: Set<string>;
  onChange: (change: Partial<Team>) => void;
};

export function RosterEntry({
  name,
  team,
  data,
  values,
  excluded,
  onChange,
}: Props) {
  const outgoing = team.assets.flatMap((asset) =>
    asset.kind === "player" ? [asset.playerId] : [],
  );
  return (
    <section className="roster-entry" aria-label={`${name} roster`}>
      <label className="trade-checkbox">
        <input
          type="checkbox"
          checked={team.rosterEnabled}
          onChange={(event) =>
            onChange({
              rosterEnabled: event.target.checked,
              roster: [...new Set([...team.roster, ...outgoing])],
            })
          }
        />
        Include {name === "Your Team" ? "your" : "other team’s"} full roster
      </label>
      {team.rosterEnabled && (
        <>
          <p className="trade-help">
            Add all players, including those being sent. Outgoing players are
            included automatically when you enable this. Only rostered players
            can then be selected to send.
          </p>
          <AssetSearch
            label={`${name}: add roster player`}
            players={data.players}
            values={values}
            excluded={new Set([...excluded, ...team.roster])}
            onAdd={(id) => onChange({ roster: [...team.roster, id] })}
          />
          {!team.roster.length && (
            <p className="trade-empty">
              Your roster is empty. Add players to evaluate team needs.
            </p>
          )}
          <ul className="roster-list">
            {team.roster.map((id) => {
              const player = data.players.find((entry) => entry.id === id);
              return (
                <li key={id}>
                  <span>
                    {player?.name ?? "Unavailable player"}{" "}
                    <small>
                      {player?.position} · {player?.team}
                    </small>
                  </span>
                  <button
                    className="trade-text-button"
                    type="button"
                    disabled={outgoing.includes(id)}
                    title={
                      outgoing.includes(id)
                        ? "Remove from trade before removing from roster"
                        : undefined
                    }
                    aria-label={`Remove ${player?.name ?? "player"} from ${name} roster`}
                    onClick={() =>
                      onChange({
                        roster: team.roster.filter((entry) => entry !== id),
                      })
                    }
                  >
                    {outgoing.includes(id) ? "Sending" : "Remove"}
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="trade-help">
            {team.roster.length} players entered. Empty starting slots count as
            zero; enter the full roster for useful grades.
          </p>
        </>
      )}
    </section>
  );
}
