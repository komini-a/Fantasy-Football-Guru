import type { LeagueSettings, Position } from "./types";

export const DEFAULT_SETTINGS: LeagueSettings = {
  league: "redraft",
  scoring: "PPR",
  teams: 12,
  keeperLimit: 3,
  keeperCost: 20,
  keeperPicks: false,
  lineup: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, SUPERFLEX: 0 },
};

// These are model assumptions, not observed trade-market prices.
export const MODEL = {
  historyDecay: 0.55,
  priorGames: 4,
  recentWeight: 0.3,
  staleSeasonDecay: 0.8,
  replacementScale: 4,
  weeklyValueWeight: 0.7,
  surplusValueWeight: 0.3,
  dynastyFutureWeight: 0.65,
  keeperFutureWeight: 0.45,
  keeperLimitScale: 8,
  futureDiscount: 0.88,
  futureSeasons: 3,
  youthCapitalBonus: 12,
  packageExponent: 1.6,
  benchWeight: 0.12,
  rosterGradeWeight: 0.65,
  fairnessBalanced: 0.1,
  fairnessSlight: 0.25,
  priorPpg: { QB: 12, RB: 5, WR: 5, TE: 4 } as Record<Position, number>,
  elitePpg: { QB: 28, RB: 24, WR: 24, TE: 20 } as Record<Position, number>,
  declineAge: { QB: 32, RB: 26, WR: 28, TE: 29 } as Record<Position, number>,
  annualDecline: { QB: 0.05, RB: 0.12, WR: 0.08, TE: 0.07 } as Record<
    Position,
    number
  >,
  rookieRoundValues: [58, 27, 12, 5],
  redraftRoundValues: [
    90, 74, 61, 50, 41, 34, 28, 23, 19, 15, 12, 9, 7, 5, 3, 2,
  ],
  pickSlotSpread: 0.3,
};

export const GRADE_THRESHOLDS = [
  { minimum: 0.4, grade: "A+" },
  { minimum: 0.28, grade: "A" },
  { minimum: 0.18, grade: "A−" },
  { minimum: 0.1, grade: "B+" },
  { minimum: 0.04, grade: "B" },
  { minimum: -0.04, grade: "B−" },
  { minimum: -0.1, grade: "C+" },
  { minimum: -0.18, grade: "C" },
  { minimum: -0.28, grade: "C−" },
  { minimum: -0.4, grade: "D" },
  { minimum: -Infinity, grade: "F" },
] as const;
