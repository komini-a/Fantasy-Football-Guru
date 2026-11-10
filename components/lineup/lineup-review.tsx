"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { currentNflSeason } from "@/lib/rankings";
import { DEFAULT_SETTINGS } from "@/lib/trade/config";
import {
  rosterSlots,
  slotKey,
  type LineupData,
  type LineupEvaluation,
  type LineupSettings,
} from "@/lib/lineup/types";
import {
  parseEvaluation,
  parseLineupRequest,
  validateRoster,
  validSeason,
} from "@/lib/lineup/validation";
import { LeagueSettings } from "./league-settings";
import { RosterEntry } from "./roster-entry";
import { LineupResults } from "./lineup-results";

type Loaded = { key: string; data: LineupData | null; error: string | null };

export function LineupReview() {
  const [accessCode, setAccessCode] = useState("");
  const [settings, setSettings] = useState<LineupSettings>(() => ({
    league: "redraft",
    scoring: "PPR",
    teams: 12,
    season: currentNflSeason(),
    draftPosition: null,
    lineup: { ...DEFAULT_SETTINGS.lineup },
    notes: "",
  }));
  const [starters, setStarters] = useState<Record<string, string>>({});
  const [bench, setBench] = useState<string[]>([]);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<LineupEvaluation | null>(null);
  const submitting = useRef(false);
  const evaluationController = useRef<AbortController | null>(null);
  const resultContainer = useRef<HTMLDivElement>(null);
  const requestKey = `${settings.season}:${settings.scoring}:${retry}`;
  const loading = loaded?.key !== requestKey;
  const data = !loading ? (loaded?.data ?? null) : null;
  const dataError = !loading ? loaded?.error : null;
  const slots = rosterSlots.flatMap((slot) =>
    Array.from(
      { length: Math.max(0, Math.min(6, Math.trunc(settings.lineup[slot]))) },
      (_, index) => ({ slot, index, key: slotKey(slot, index) }),
    ),
  );
  const excluded = new Set([...Object.values(starters), ...bench]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function load() {
      if (!validSeason(settings.season)) {
        setLoaded({
          key: requestKey,
          data: null,
          error: "Enter a valid season to load players.",
        });
        return;
      }
      try {
        const response = await fetch(
          `/api/lineup-review?${new URLSearchParams({ season: String(settings.season), scoring: settings.scoring })}`,
          {
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(20_000),
            ]),
            cache: "no-store",
          },
        );
        if (!response.ok) throw new Error("Data unavailable");
        const next: LineupData = await response.json();
        if (active) setLoaded({ key: requestKey, data: next, error: null });
      } catch {
        if (active)
          setLoaded({
            key: requestKey,
            data: null,
            error: "Player data couldn’t be loaded. Please try again.",
          });
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
    };
  }, [requestKey, settings.scoring, settings.season]);

  useEffect(() => () => evaluationController.current?.abort(), []);
  useEffect(() => {
    if (result) resultContainer.current?.focus();
  }, [result]);

  function edited() {
    setResult(null);
    setMessage(null);
  }

  function changeSettings(change: Partial<LineupSettings>) {
    edited();
    if (change.lineup) {
      const nextKeys = new Set(
        rosterSlots.flatMap((slot) =>
          Array.from(
            {
              length: Math.max(
                0,
                Math.min(6, Math.trunc(change.lineup![slot])),
              ),
            },
            (_, index) => slotKey(slot, index),
          ),
        ),
      );
      const removed = Object.entries(starters).filter(
        ([key]) => !nextKeys.has(key),
      );
      if (bench.length + removed.length > 30) {
        setMessage(
          "Remove some bench players before reducing starting slots; the bench limit is 30.",
        );
        return;
      }
      setBench([...bench, ...removed.map(([, id]) => id)]);
      setStarters(
        Object.fromEntries(
          Object.entries(starters).filter(([key]) => nextKeys.has(key)),
        ),
      );
      if (removed.length)
        setMessage(
          "Players from removed starting slots were moved to your bench.",
        );
    }
    setSettings((previous) => ({ ...previous, ...change }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !data) return;
    setMessage(null);
    setResult(null);
    let input;
    try {
      input = parseLineupRequest({
        settings,
        starters: slots
          .filter(({ key }) => starters[key])
          .map(({ slot, index, key }) => ({
            slot,
            index,
            playerId: starters[key],
          })),
        bench,
      });
      validateRoster(input, data.players);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Check your lineup and settings.",
      );
      return;
    }
    submitting.current = true;
    setPending(true);
    const controller = new AbortController();
    evaluationController.current = controller;
    try {
      const response = await fetch("/api/lineup-review", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessCode.trim()}`,
        },
        redirect: "error",
        body: JSON.stringify(input),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(55_000),
        ]),
      });
      const body = await response.json();
      if (!response.ok) {
        setMessage(
          typeof body.message === "string"
            ? body.message
            : "The evaluation couldn’t be completed. Please try again.",
        );
        return;
      }
      setResult(parseEvaluation(body));
    } catch {
      if (!controller.signal.aborted)
        setMessage(
          "The evaluation couldn’t be completed. Please try again. Your lineup has been kept.",
        );
    } finally {
      submitting.current = false;
      setPending(false);
      evaluationController.current = null;
    }
  }

  return (
    <>
      <form onSubmit={submit} aria-busy={pending}>
        <fieldset className="lineup-form-fields" disabled={pending}>
          <legend className="visually-hidden">
            Lineup and league settings
          </legend>
          <LeagueSettings settings={settings} onChange={changeSettings} />
          {loading && (
            <div className="rankings-state" role="status">
              <span className="loading-dot" />
              Loading players & scoring data…
            </div>
          )}
          {dataError && (
            <div className="rankings-state" role="alert">
              <h2>Player data unavailable</h2>
              <p>{dataError}</p>
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
                  {data.season} season · {data.scoring}
                </strong>
                <p>
                  Uses imported player history and available projections. No
                  live injury, news, or depth-chart data.
                </p>
                <details>
                  <summary>Scoring rules & data coverage</summary>
                  <p>
                    {data.latestGame
                      ? `Latest completed game in this season’s data: ${new Date(data.latestGame).toLocaleDateString("en-US", { timeZone: "UTC" })}.`
                      : "No completed games are loaded for this season."}{" "}
                    History may be incomplete.
                  </p>
                  <p>
                    {data.projection
                      ? `Projection source: ${data.projection.source}, weeks ${data.projection.startWeek}–${data.projection.endWeek}, as of ${new Date(data.projection.asOf).toLocaleDateString("en-US", { timeZone: "UTC" })}.`
                      : "No projections are loaded for this season."}{" "}
                    Team, age, and status reflect the current catalog.
                  </p>
                  <dl className="trade-scoring-rules">
                    {data.scoringRules.map((rule) => (
                      <div key={rule.label}>
                        <dt>{rule.label}</dt>
                        <dd>{rule.rate} pts each</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              </aside>
              {!data.players.length && (
                <p className="trade-empty" role="status">
                  No players are loaded. Import player data before rating a
                  lineup.
                </p>
              )}
              <section className="trade-panel">
                <div className="trade-section-heading">
                  <h2>Build your roster</h2>
                  <span>02 / Your lineup</span>
                </div>
                <p className="trade-help">
                  Fill every starting slot. Add your bench for a more useful
                  depth assessment (optional, up to 30 players). To move a
                  player, remove them from their current slot and add them to
                  the new one.
                </p>
                <div className="lineup-slots">
                  {slots.map(({ slot, index, key }) => (
                    <RosterEntry
                      key={key}
                      label={`${slot} ${index + 1} (required)`}
                      slot={slot}
                      selected={starters[key] ? [starters[key]] : []}
                      players={data.players}
                      excluded={excluded}
                      onAdd={(id) => {
                        if (excluded.has(id)) return;
                        edited();
                        setStarters((previous) => ({ ...previous, [key]: id }));
                      }}
                      onRemove={() => {
                        edited();
                        setStarters((previous) => {
                          const next = { ...previous };
                          delete next[key];
                          return next;
                        });
                      }}
                    />
                  ))}
                </div>
                <RosterEntry
                  label="Bench (optional)"
                  selected={bench}
                  players={data.players}
                  excluded={excluded}
                  onAdd={(id) => {
                    if (excluded.has(id) || bench.length >= 30) return;
                    edited();
                    setBench((previous) => [...previous, id]);
                  }}
                  onRemove={(id) => {
                    edited();
                    setBench((previous) =>
                      previous.filter((entry) => entry !== id),
                    );
                  }}
                />
                <p className="trade-help">
                  {Object.keys(starters).length} / {slots.length} starters ·{" "}
                  {bench.length} bench players
                </p>
              </section>
            </>
          )}
          <label className="lineup-notes">
            Lineup access code
            <input
              type="password"
              autoComplete="off"
              required
              maxLength={64}
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
            />
            <small>The app sends your roster, league settings and notes to Google Gemini when you request a rating. Keep personal details out of your notes.</small>
          </label>
          <div className="lineup-submit">
            <button
              type="submit"
              className="button button-dark"
              disabled={pending || !data?.players.length}
            >
              {pending ? "Evaluating your lineup…" : "Rate my lineup"}
            </button>
          </div>
        </fieldset>
        {pending && (
          <p className="trade-help" role="status">
            Evaluating your roster and league settings. This can take up to a
            minute.
          </p>
        )}
        {message && (
          <p className="trade-validation" role="alert">
            {message}
          </p>
        )}
      </form>
      <div ref={resultContainer} tabIndex={-1} aria-live="polite">
        {result && <LineupResults result={result} />}
      </div>
    </>
  );
}
