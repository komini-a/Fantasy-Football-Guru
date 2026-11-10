export const positions = ["All", "QB", "RB", "WR", "TE", "Flex"] as const;
export type PositionFilter = (typeof positions)[number];
export const scoringFormats = ["PPR", "Half PPR", "Standard"] as const;
export type ScoringFormat = (typeof scoringFormats)[number];
export const PAGE_SIZE = 20;

export type StatBreakdown = {
  label: string;
  group: string;
  value: number;
  points: number | null;
  rate: number | null;
};

export type RankedPlayer = {
  id: string;
  rank: number;
  name: string;
  position: string;
  team: string;
  gamesPlayed: number;
  totalPoints: number;
  stats: StatBreakdown[];
};

export type RankingsData = {
  seasons: number[];
  formats: ScoringFormat[];
  season: number | null;
  scoring: ScoringFormat;
  position: PositionFilter;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  players: RankedPlayer[];
};

export function currentNflSeason(date = new Date()): number {
  return date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0);
}

export function defaultSeason(
  seasons: number[],
  date = new Date(),
): number | null {
  const current = currentNflSeason(date);
  return seasons.includes(current)
    ? current
    : seasons.length
      ? Math.max(...seasons)
      : null;
}

export const formatPoints = (value: number) =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
