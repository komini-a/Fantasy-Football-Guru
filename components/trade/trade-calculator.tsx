"use client";

import { useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/trade/config";
import { evaluateTrade, validateTrade } from "@/lib/trade/evaluation";
import type {
  Asset,
  LeagueSettings as Settings,
  Team,
  TradeData,
} from "@/lib/trade/types";
import { valueAssets, valuePlayers } from "@/lib/trade/valuation";
import { LeagueSettings } from "./league-settings";
import { TradeSide } from "./trade-side";
import { TradeResults } from "./trade-results";

type Loaded = { key: string; data: TradeData | null; error: string | null };
const emptyTeam = (): Team => ({
  assets: [],
  roster: [],
  rosterEnabled: false,
});

export function TradeCalculator() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [teams, setTeams] = useState<Team[]>([emptyTeam(), emptyTeam()]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const requestKey = `${settings.scoring}:${retry}`;
  const loading = loaded?.key !== requestKey;
  const data = !loading ? (loaded?.data ?? null) : null;
  const error = !loading ? loaded?.error : null;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(
          `/api/trade-calculator?${new URLSearchParams({ scoring: settings.scoring })}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (!response.ok) throw new Error("Data unavailable");
        const next: TradeData = await response.json();
        if (active) setLoaded({ key: requestKey, data: next, error: null });
      } catch {
        if (active)
          setLoaded({
            key: requestKey,
            data: null,
            error:
              "Player data couldn’t be loaded. Check the database connection and try again.",
          });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestKey, settings.scoring]);

  const values = useMemo(
    () => (data ? valuePlayers(data, settings) : new Map()),
    [data, settings],
  );
  const evaluated = useMemo(
    () => (data ? evaluateTrade(teams, settings, data) : null),
    [teams, settings, data],
  );
  const assets = data
    ? teams.map((team) => valueAssets(team.assets, data, settings, values))
    : [[], []];

  function changeTeam(index: number, change: Partial<Team>) {
    setMessage(null);
    setTeams((previous) =>
      previous.map((team, side) =>
        side === index ? { ...team, ...change } : team,
      ),
    );
  }

  function addAsset(index: number, asset: Asset) {
    if (!data) return;
    const next = teams.map((team, side) =>
      side === index ? { ...team, assets: [...team.assets, asset] } : team,
    );
    const previousErrors = validateTrade(teams, settings, data);
    const newErrors = validateTrade(next, settings, data).filter(
      (error) => !previousErrors.includes(error),
    );
    if (newErrors.length) {
      setMessage(newErrors.join(" "));
      return;
    }
    changeTeam(index, { assets: next[index].assets });
  }

  return (
    <>
      <LeagueSettings
        settings={settings}
        data={data}
        onChange={(change) => {
          setMessage(null);
          setSettings((previous) => ({ ...previous, ...change }));
        }}
      />
      {loading && (
        <div className="rankings-state" role="status">
          <span className="loading-dot" />
          Loading players & scoring data…
        </div>
      )}
      {error && (
        <div className="rankings-state" role="alert">
          <h2>Trade data unavailable</h2>
          <p>{error}</p>
          <button
            type="button"
            className="button button-dark"
            onClick={() => setRetry((value) => value + 1)}
          >
            Try again
          </button>
        </div>
      )}
      {data && (
        <>
          <aside className="trade-data-note">
            <strong>
              Model estimates · {data.season} season · {settings.scoring}
            </strong>
            <p>
              {data.remainingWeeks
                ? `Production window: weeks ${data.nextWeek}–18 (${data.remainingWeeks} calendar weeks).`
                : "Regular season complete."}{" "}
              Data checked{" "}
              {new Date(data.asOf).toLocaleDateString("en-US", {
                timeZone: "America/Detroit",
              })}
              .
            </p>
            <details>
              <summary>Data sources & limitations</summary>
              <ul>
                {data.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <p>
                Source: imported nflverse game and player data.
                {data.projectionSource
                  ? ` Projection set: ${data.projectionSource}.`
                  : " No matching rest-of-season projection set is loaded."}
              </p>
            </details>
          </aside>
          {!data.players.length && (
            <p className="trade-empty" role="status">
              No eligible players are loaded. Run the existing player and
              game-data importer. Eligible draft picks can still be compared.
            </p>
          )}
          <div className="trade-builder-heading">
            <div>
              <p className="eyebrow">02 / BUILD THE DEAL</p>
              <p>Add what each team sends away.</p>
            </div>
            <button
              type="button"
              className="trade-text-button"
              onClick={() => {
                setTeams([emptyTeam(), emptyTeam()]);
                setMessage(null);
              }}
            >
              Clear trade & rosters
            </button>
          </div>
          {message && (
            <p className="trade-validation" role="alert">
              {message}
            </p>
          )}
          <div className="trade-sides">
            {teams.map((team, index) => {
              const other = teams[1 - index];
              const tradePlayers = teams.flatMap((side) =>
                side.assets.flatMap((asset) =>
                  asset.kind === "player" ? [asset.playerId] : [],
                ),
              );
              const otherPlayers = [
                ...(other.rosterEnabled ? other.roster : []),
                ...other.assets.flatMap((asset) =>
                  asset.kind === "player" ? [asset.playerId] : [],
                ),
              ];
              return (
                <TradeSide
                  key={index}
                  name={index === 0 ? "Your Team" : "Other Team"}
                  team={team}
                  sent={assets[index]}
                  received={assets[1 - index]}
                  data={data}
                  settings={settings}
                  values={values}
                  excluded={new Set([...tradePlayers, ...otherPlayers])}
                  rosterExcluded={new Set(otherPlayers)}
                  onChange={(change) => changeTeam(index, change)}
                  onAdd={(asset) => addAsset(index, asset)}
                />
              );
            })}
          </div>
          {evaluated?.result ? (
            <TradeResults result={evaluated.result} />
          ) : (
            <section
              className="trade-panel trade-validation"
              aria-label="Trade validation"
              aria-live="polite"
            >
              <h2>Ready when both sides are set</h2>
              <ul>
                {evaluated?.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  );
}
