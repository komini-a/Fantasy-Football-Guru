"use client";

import { useEffect, useState } from "react";
import type {
  PositionFilter,
  RankingsData,
  ScoringFormat,
} from "@/lib/rankings";
import { RankingFilters } from "./ranking-filters";
import { RankingPagination } from "./ranking-pagination";
import { RankingsTable } from "./rankings-table";
import { PlayerDetails } from "./player-details";

type Filters = {
  season: number | null;
  position: PositionFilter;
  scoring: ScoringFormat;
  page: number;
};
type Result = { key: string; data: RankingsData | null; error: string | null };

export function RankingsBrowser() {
  const [filters, setFilters] = useState<Filters>({
    season: null,
    position: "All",
    scoring: "PPR",
    page: 1,
  });
  const [result, setResult] = useState<Result | null>(null);
  const [options, setOptions] = useState<Pick<
    RankingsData,
    "seasons" | "formats" | "season"
  > | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const query = new URLSearchParams({
    position: filters.position,
    scoring: filters.scoring,
    page: String(filters.page),
  });
  if (filters.season !== null) query.set("season", String(filters.season));
  const queryString = query.toString();
  const requestKey = `${queryString}:${retry}`;
  const loading = result?.key !== requestKey;
  const data = loading ? null : result?.data;
  const error = loading ? null : result?.error;
  const selected = data?.players.find((player) => player.id === selectedId);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      try {
        const response = await fetch(`/api/player-rankings?${queryString}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok)
          throw new Error("Rankings couldn’t be loaded. Please try again.");
        const next: RankingsData = await response.json();
        if (active) {
          setResult({ key: requestKey, data: next, error: null });
          setOptions({
            seasons: next.seasons,
            formats: next.formats,
            season: next.season,
          });
        }
      } catch {
        if (active)
          setResult({
            key: requestKey,
            data: null,
            error: "Rankings couldn’t be loaded. Please try again.",
          });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [queryString, requestKey]);

  function changeFilters(change: Partial<Filters>) {
    setSelectedId(null);
    setFilters((previous) => ({
      ...previous,
      season: data?.season ?? previous.season,
      page: 1,
      ...change,
    }));
  }

  function closeDetails() {
    setSelectedId(null);
    document
      .querySelector<HTMLButtonElement>(".selected-row .player-name")
      ?.focus({ preventScroll: true });
  }

  return (
    <>
      <RankingFilters
        seasons={options?.seasons ?? []}
        season={filters.season ?? options?.season ?? null}
        seasonPlaceholder={
          loading
            ? "Loading seasons…"
            : error
              ? "Seasons unavailable"
              : "No seasons available"
        }
        scoring={filters.scoring}
        formats={options?.formats ?? []}
        position={filters.position}
        onSeason={(season) => changeFilters({ season })}
        onScoring={(scoring) => changeFilters({ scoring })}
        onPosition={(position) => changeFilters({ position })}
      />
      {selected && data?.season && (
        <PlayerDetails
          player={selected}
          season={data.season}
          scoring={data.scoring}
          onClose={closeDetails}
        />
      )}
      <section
        className="rankings-results"
        aria-label="Rankings"
        aria-busy={loading}
      >
        <div className="ranking-summary">
          <h2>
            {filters.position === "All"
              ? "All players"
              : filters.position === "Flex"
                ? "Flex · RB, WR & TE"
                : `${filters.position} rankings`}
          </h2>
          <p>
            {data ? `${data.total} players · ` : ""}
            {filters.scoring} · Total fantasy points
          </p>
        </div>
        {loading && (
          <div className="rankings-state" role="status">
            <span className="loading-dot" />
            Loading rankings…
          </div>
        )}
        {error && (
          <div className="rankings-state" role="alert">
            <h3>Rankings unavailable</h3>
            <p>{error}</p>
            <button
              type="button"
              className="button button-dark"
              onClick={() => {
                setSelectedId(null);
                setRetry((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
        {data && !data.players.length && (
          <div className="rankings-state" role="status">
            <h3>No rankings yet</h3>
            <p>
              {data.season === null
                ? "Season rankings will appear when game data is available."
                : `No ${data.position === "All" ? "player" : data.position} results for ${data.season}. Try another season or position.`}
            </p>
          </div>
        )}
        {data && data.players.length > 0 && (
          <RankingsTable
            players={data.players}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        )}
        <RankingPagination
          page={data?.page ?? filters.page}
          totalPages={data?.totalPages ?? 0}
          loading={loading}
          disabled={loading || Boolean(error) || !data?.players.length}
          onPage={(page) => changeFilters({ page })}
        />
      </section>
      <p className="rankings-footnote">
        Regular season · Completed games · Select a player for their scoring
        breakdown.
        <br />
        Season statistics sourced from nflverse. Ties are ordered by player
        name, then player ID.
      </p>
    </>
  );
}
