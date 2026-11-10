import { formatPoints } from "@/lib/rankings";
import {
  assetKey,
  type Asset,
  type LeagueSettings,
  type PlayerValue,
  type Team,
  type TradeData,
  type ValuedAsset,
} from "@/lib/trade/types";
import { picksAllowed } from "@/lib/trade/valuation";
import { AssetSearch } from "./asset-search";
import { PickBuilder } from "./pick-builder";
import { RosterEntry } from "./roster-entry";

type Props = {
  name: string;
  team: Team;
  sent: ValuedAsset[];
  received: ValuedAsset[];
  data: TradeData;
  settings: LeagueSettings;
  values: Map<string, PlayerValue>;
  excluded: Set<string>;
  rosterExcluded: Set<string>;
  onChange: (change: Partial<Team>) => void;
  onAdd: (asset: Asset) => void;
};

export function TradeSide({
  name,
  team,
  sent,
  received,
  data,
  settings,
  values,
  excluded,
  rosterExcluded,
  onChange,
  onAdd,
}: Props) {
  return (
    <section className="trade-panel trade-side" aria-label={name}>
      <div className="trade-section-heading">
        <h2>{name}</h2>
        <span>{team.assets.length} assets sent</span>
      </div>
      <h3>
        Sends away <span>→</span>
      </h3>
      <AssetSearch
        label={`${name}: search players to send`}
        players={
          team.rosterEnabled
            ? data.players.filter((player) => team.roster.includes(player.id))
            : data.players
        }
        values={values}
        excluded={excluded}
        onAdd={(playerId) => onAdd({ kind: "player", playerId })}
      />
      <ul className="trade-asset-list">
        {sent.map((entry) => (
          <li key={assetKey(entry.asset)}>
            <div>
              <strong>{entry.name}</strong>
              <small>{entry.detail}</small>
              {entry.notes.length > 0 && (
                <details className="asset-notes">
                  <summary>Estimate notes</summary>
                  <ul>
                    {entry.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <div className="asset-value">
              <strong>{formatPoints(entry.value)}</strong>
              <button
                className="trade-text-button"
                type="button"
                aria-label={`Remove ${entry.name} from ${name} trade`}
                onClick={() =>
                  onChange({
                    assets: team.assets.filter(
                      (asset) => assetKey(asset) !== assetKey(entry.asset),
                    ),
                  })
                }
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
      {!sent.length && (
        <p className="trade-empty">
          No assets yet. Add the players this team gives up.
        </p>
      )}
      {picksAllowed(settings) ? (
        <PickBuilder settings={settings} season={data.season} onAdd={onAdd} />
      ) : (
        <p className="trade-help">Future picks disabled by league rules.</p>
      )}
      <div className="trade-side-total">
        <span>Total sent</span>
        <strong>
          {formatPoints(sent.reduce((sum, entry) => sum + entry.value, 0))}
        </strong>
      </div>
      <div className="trade-receives">
        <h3>
          Receives <span>←</span>
        </h3>
        {received.length ? (
          <ul>
            {received.map((entry) => (
              <li key={assetKey(entry.asset)}>
                <span>
                  {entry.name}
                  <small>{entry.detail}</small>
                </span>
                <strong>{formatPoints(entry.value)}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="trade-help">
            Assets added on the other side will appear here.
          </p>
        )}
      </div>
      <RosterEntry
        name={name}
        team={team}
        data={data}
        values={values}
        excluded={rosterExcluded}
        onChange={onChange}
      />
    </section>
  );
}
