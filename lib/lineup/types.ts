import type { ScoringFormat } from "@/lib/rankings";
import type { LeagueType, Lineup, Player } from "@/lib/trade/types";

export const rosterSlots = [
  "QB",
  "RB",
  "WR",
  "TE",
  "FLEX",
  "SUPERFLEX",
] as const;
export type RosterSlot = (typeof rosterSlots)[number];
export const grades = [
  "F",
  "D-",
  "D",
  "D+",
  "C-",
  "C",
  "C+",
  "B-",
  "B",
  "B+",
  "A-",
  "A",
  "A+",
] as const;
export const needPositions = ["QB", "RB", "WR", "TE"] as const;

export type LineupSettings = {
  league: LeagueType;
  scoring: ScoringFormat;
  teams: number;
  season: number;
  draftPosition: number | null;
  lineup: Lineup;
  notes: string;
};

export type Starter = { slot: RosterSlot; index: number; playerId: string };
export type LineupRequest = {
  settings: LineupSettings;
  starters: Starter[];
  bench: string[];
};

export type LineupEvaluation = {
  grade: (typeof grades)[number];
  positionsOfNeed: {
    position: (typeof needPositions)[number];
    explanation: string;
  }[];
  summary: string;
};

export type LineupData = {
  season: number;
  scoring: ScoringFormat;
  asOf: string;
  latestGame: string | null;
  scoringRules: { label: string; rate: number }[];
  projection: {
    source: string;
    asOf: string;
    startWeek: number;
    endWeek: number;
  } | null;
  players: Player[];
};

export const slotKey = (slot: RosterSlot, index: number) => `${slot}-${index}`;

export function eligibleForSlot(position: string, slot: RosterSlot): boolean {
  if (slot === "SUPERFLEX")
    return needPositions.some((value) => value === position);
  if (slot === "FLEX") return ["RB", "WR", "TE"].includes(position);
  return position === slot;
}
