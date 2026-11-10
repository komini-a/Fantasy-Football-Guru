import { currentNflSeason, scoringFormats } from "@/lib/rankings";
import type { Player } from "@/lib/trade/types";
import {
  eligibleForSlot,
  grades,
  needPositions,
  rosterSlots,
  slotKey,
  type LineupEvaluation,
  type LineupRequest,
} from "./types";

export class LineupInputError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

function playerId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}

export function validSeason(value: unknown): value is number {
  return integer(value, 2000, currentNflSeason() + 5);
}

export function parseLineupRequest(value: unknown): LineupRequest {
  if (!record(value) || !record(value.settings))
    throw new LineupInputError("Provide a lineup and league settings.");
  const settings = value.settings;
  if (!["redraft", "keeper", "dynasty"].includes(String(settings.league)))
    throw new LineupInputError("Choose redraft, keeper, or dynasty.");
  if (!scoringFormats.some((format) => format === settings.scoring))
    throw new LineupInputError("Choose a supported scoring format.");
  if (!integer(settings.teams, 4, 32))
    throw new LineupInputError(
      "League size must be a whole number from 4 to 32.",
    );
  if (!validSeason(settings.season))
    throw new LineupInputError(
      `Season must be a whole number from 2000 to ${currentNflSeason() + 5}.`,
    );
  if (
    settings.draftPosition !== null &&
    !integer(settings.draftPosition, 1, settings.teams)
  )
    throw new LineupInputError(
      "Draft position must be between 1 and the number of teams, or left blank.",
    );
  if (typeof settings.notes !== "string" || settings.notes.length > 3000)
    throw new LineupInputError(
      "Additional context must be at most 3,000 characters.",
    );
  const lineup = settings.lineup;
  if (
    !record(lineup) ||
    Object.keys(lineup).length !== rosterSlots.length ||
    rosterSlots.some((slot) => !integer(lineup[slot], 0, 6))
  )
    throw new LineupInputError(
      "Each starting roster requirement must be a whole number from 0 to 6.",
    );
  const count = Object.values(lineup).reduce<number>(
    (sum, number) => sum + (number as number),
    0,
  );
  if (count < 1 || count > 24)
    throw new LineupInputError("Choose between 1 and 24 total starting slots.");
  if (!Array.isArray(value.starters) || value.starters.length !== count)
    throw new LineupInputError(
      "Fill every required starting slot before requesting a rating.",
    );
  const slots = new Set<string>();
  const ids = new Set<string>();
  for (const entry of value.starters) {
    if (
      !record(entry) ||
      !rosterSlots.some((slot) => slot === entry.slot) ||
      !integer(entry.index, 0, (lineup[entry.slot as string] as number) - 1) ||
      !playerId(entry.playerId)
    )
      throw new LineupInputError(
        "Every starter needs a valid roster slot and selected player.",
      );
    const key = slotKey(
      entry.slot as (typeof rosterSlots)[number],
      entry.index,
    );
    if (slots.has(key))
      throw new LineupInputError(
        "Only one player can occupy each starting slot.",
      );
    if (ids.has(entry.playerId))
      throw new LineupInputError("A player can only be selected once.");
    slots.add(key);
    ids.add(entry.playerId);
  }
  if (
    !Array.isArray(value.bench) ||
    value.bench.length > 30 ||
    !value.bench.every(playerId)
  )
    throw new LineupInputError(
      "Select up to 30 bench players using player search.",
    );
  for (const id of value.bench) {
    if (ids.has(id))
      throw new LineupInputError("A player can only be selected once.");
    ids.add(id);
  }
  // Construct only the accepted fields; client-supplied player facts are ignored.
  return {
    settings: {
      league: settings.league as LineupRequest["settings"]["league"],
      scoring: settings.scoring as LineupRequest["settings"]["scoring"],
      teams: settings.teams,
      season: settings.season,
      draftPosition: settings.draftPosition as number | null,
      lineup: Object.fromEntries(
        rosterSlots.map((slot) => [slot, lineup[slot]]),
      ) as LineupRequest["settings"]["lineup"],
      notes: settings.notes.trim(),
    },
    starters: value.starters.map(({ slot, index, playerId }) => ({
      slot,
      index,
      playerId,
    })),
    bench: [...value.bench],
  };
}

export function validateRoster(
  request: LineupRequest,
  players: Player[],
): void {
  const byId = new Map(players.map((player) => [player.id, player]));
  for (const id of [
    ...request.starters.map((entry) => entry.playerId),
    ...request.bench,
  ]) {
    if (!byId.has(id))
      throw new LineupInputError(
        "A selected player is unavailable. Remove or replace them and try again.",
      );
  }
  for (const entry of request.starters) {
    if (!eligibleForSlot(byId.get(entry.playerId)!.position, entry.slot))
      throw new LineupInputError(
        `Select an eligible player for ${entry.slot} ${entry.index + 1}.`,
      );
  }
}

export function parseEvaluation(value: unknown): LineupEvaluation {
  const invalid = () => new Error("The AI returned an incomplete evaluation.");
  if (
    !record(value) ||
    !grades.some((grade) => grade === value.grade) ||
    !Array.isArray(value.positionsOfNeed) ||
    value.positionsOfNeed.length !== 3 ||
    typeof value.summary !== "string" ||
    !value.summary.trim() ||
    value.summary.length > 2000 ||
    /[\r\n]/.test(value.summary)
  )
    throw invalid();
  const seen = new Set<string>();
  const positionsOfNeed = value.positionsOfNeed.map((need) => {
    if (
      !record(need) ||
      !needPositions.some((position) => position === need.position) ||
      typeof need.explanation !== "string" ||
      !need.explanation.trim() ||
      need.explanation.length > 500 ||
      seen.has(need.position as string)
    )
      throw invalid();
    seen.add(need.position as string);
    return {
      position:
        need.position as LineupEvaluation["positionsOfNeed"][number]["position"],
      explanation: need.explanation.trim(),
    };
  });
  return {
    grade: value.grade as LineupEvaluation["grade"],
    positionsOfNeed,
    summary: value.summary.trim(),
  };
}
