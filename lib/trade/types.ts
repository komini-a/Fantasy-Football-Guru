import type { ScoringFormat } from "@/lib/rankings";

export type Position = "QB" | "RB" | "WR" | "TE";
export type LeagueType = "redraft" | "keeper" | "dynasty";
export type DraftType = "rookie" | "redraft";
export type Lineup = Record<Position | "FLEX" | "SUPERFLEX", number>;

export type LeagueSettings = {
  league: LeagueType;
  scoring: ScoringFormat;
  teams: number;
  keeperLimit: number;
  keeperCost: number;
  keeperPicks: boolean;
  lineup: Lineup;
};

export type Player = {
  id: string;
  name: string;
  position: Position;
  team: string;
  age: number | null;
  draftPick: number | null;
  rookieSeason: number | null;
  status: string;
  history: { season: number; games: number; points: number }[];
  recentPpg: number | null;
  recentGames: number;
  projectedPoints: number | null;
};

export type TradeData = {
  season: number;
  nextWeek: number;
  remainingWeeks: number;
  asOf: string;
  scoring: ScoringFormat;
  formats: ScoringFormat[];
  scoringRules: { label: string; rate: number }[];
  projectionSource: string | null;
  warnings: string[];
  players: Player[];
};

export type PlayerAsset = { kind: "player"; playerId: string };
export type PickAsset = {
  kind: "pick";
  id: string;
  year: number;
  round: number;
  draftType: DraftType;
  slot: number | null;
  range: "early" | "mid" | "late";
  origin: number;
};
export type Asset = PlayerAsset | PickAsset;
export type Team = {
  assets: Asset[];
  rosterEnabled: boolean;
  roster: string[];
};
export type PlayerValue = {
  value: number;
  weeklyPoints: number;
  notes: string[];
};
export type ValuedAsset = {
  asset: Asset;
  name: string;
  detail: string;
  value: number;
  notes: string[];
};

export const assetKey = (asset: Asset) =>
  asset.kind === "player" ? `player:${asset.playerId}` : `pick:${asset.id}`;
