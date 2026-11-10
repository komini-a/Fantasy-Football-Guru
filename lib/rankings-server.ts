import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import {
  defaultSeason,
  PAGE_SIZE,
  positions,
  scoringFormats,
  type PositionFilter,
  type ScoringFormat,
  type RankingsData,
  type StatBreakdown,
} from "@/lib/rankings";

export class RankingsInputError extends Error {}

type StatDefinition = {
  column: string;
  label: string;
  group: string;
  coefficient?: string;
};

export const scoringStatDefinitions: StatDefinition[] = [
  { column: "pass_attempts", label: "Pass attempts", group: "Passing" },
  { column: "pass_completions", label: "Completions", group: "Passing" },
  {
    column: "passing_yards",
    label: "Passing yards",
    group: "Passing",
    coefficient: "points_per_passing_yard",
  },
  {
    column: "pass_touchdowns",
    label: "Passing touchdowns",
    group: "Passing",
    coefficient: "points_per_passing_td",
  },
  {
    column: "interceptions_thrown",
    label: "Interceptions thrown",
    group: "Passing",
    coefficient: "points_per_interception",
  },
  {
    column: "passing_two_point_conversions",
    label: "Passing two-point conversions",
    group: "Passing",
    coefficient: "points_per_two_point_conversion",
  },
  { column: "rush_attempts", label: "Rush attempts", group: "Rushing" },
  {
    column: "rushing_yards",
    label: "Rushing yards",
    group: "Rushing",
    coefficient: "points_per_rushing_yard",
  },
  {
    column: "rush_touchdowns",
    label: "Rushing touchdowns",
    group: "Rushing",
    coefficient: "points_per_rushing_td",
  },
  {
    column: "rushing_two_point_conversions",
    label: "Rushing two-point conversions",
    group: "Rushing",
    coefficient: "points_per_two_point_conversion",
  },
  { column: "targets", label: "Targets", group: "Receiving" },
  {
    column: "receptions",
    label: "Receptions",
    group: "Receiving",
    coefficient: "points_per_reception",
  },
  {
    column: "receiving_yards",
    label: "Receiving yards",
    group: "Receiving",
    coefficient: "points_per_receiving_yard",
  },
  {
    column: "receiving_touchdowns",
    label: "Receiving touchdowns",
    group: "Receiving",
    coefficient: "points_per_receiving_td",
  },
  {
    column: "receiving_two_point_conversions",
    label: "Receiving two-point conversions",
    group: "Receiving",
    coefficient: "points_per_two_point_conversion",
  },
  {
    column: "fumbles_lost",
    label: "Fumbles lost",
    group: "Other scoring",
    coefficient: "points_per_fumble_lost",
  },
  {
    column: "return_touchdowns",
    label: "Return touchdowns",
    group: "Other scoring",
    coefficient: "points_per_return_td",
  },
  {
    column: "other_touchdowns",
    label: "Other touchdowns",
    group: "Other scoring",
    coefficient: "points_per_other_td",
  },
];

export function seasonBreakdown(
  row: RowDataPacket,
  profile: RowDataPacket,
): StatBreakdown[] {
  return scoringStatDefinitions.map(({ column, label, group, coefficient }) => {
    const value = Number(row[column]);
    const rate = coefficient ? Number(profile[coefficient]) : null;
    return {
      label,
      group,
      value,
      rate,
      points: rate === null ? null : value * rate,
    };
  });
}

function integerParameter(
  params: URLSearchParams,
  name: string,
  min: number,
  max: number,
) {
  const raw = params.get(name);
  if (raw === null) return null;
  if (!/^\d+$/.test(raw) || Number(raw) < min || Number(raw) > max) {
    throw new RankingsInputError(`Invalid ${name}.`);
  }
  return Number(raw);
}

// Historical positions and teams come from appearances in the selected season.
const appearances = `WITH appearances AS (
  SELECT s.player_id, s.position_at_game, t.team_code,
    ROW_NUMBER() OVER (PARTITION BY s.player_id ORDER BY g.week DESC, g.kickoff_utc DESC, g.game_id DESC) AS latest
  FROM player_game_stats s
  JOIN games g ON g.game_id = s.game_id
  JOIN teams t ON t.team_id = s.team_id
  WHERE g.season = ? AND g.season_type = 'REG' AND g.game_status = 'FINAL'
), season_players AS (
  SELECT player_id, MAX(CASE WHEN latest = 1 THEN position_at_game END) AS position,
    GROUP_CONCAT(DISTINCT team_code ORDER BY team_code SEPARATOR ' / ') AS team
  FROM appearances GROUP BY player_id
)`;

export async function getRankings(
  params: URLSearchParams,
): Promise<RankingsData> {
  const requestedSeason = integerParameter(params, "season", 1900, 9999);
  const requestedPage = integerParameter(params, "page", 1, 1000000) ?? 1;
  const position = (params.get("position") ?? "All") as PositionFilter;
  const scoring = (params.get("scoring") ?? "PPR") as ScoringFormat;
  if (!positions.includes(position))
    throw new RankingsInputError("Invalid position.");
  if (!scoringFormats.includes(scoring))
    throw new RankingsInputError("Invalid scoring format.");

  const [seasonRows, profiles] = await Promise.all([
    query<RowDataPacket[]>(`SELECT DISTINCT g.season FROM games g
      JOIN player_game_stats s ON s.game_id = g.game_id
      WHERE g.season_type = 'REG' AND g.game_status = 'FINAL' ORDER BY g.season DESC`),
    query<RowDataPacket[]>(
      "SELECT * FROM scoring_profiles WHERE profile_name IN ('PPR', 'Half PPR', 'Standard')",
    ),
  ]);
  const seasons = seasonRows.map((row) => Number(row.season));
  const profile = profiles.find((row) => row.profile_name === scoring);
  if (!profile) throw new Error("Scoring profile unavailable");
  const season = requestedSeason ?? defaultSeason(seasons);
  if (season !== null && !seasons.includes(season)) {
    throw new RankingsInputError(
      "No ranking data is available for that season.",
    );
  }
  const result: RankingsData = {
    seasons,
    formats: scoringFormats.filter((format) =>
      profiles.some((row) => row.profile_name === format),
    ),
    season,
    scoring,
    position,
    page: 1,
    pageSize: PAGE_SIZE,
    total: 0,
    totalPages: 0,
    players: [],
  };
  if (season === null) return result;

  const filter =
    position === "All"
      ? ""
      : position === "Flex"
        ? "AND sp.position IN ('RB', 'WR', 'TE')"
        : "AND sp.position = ?";
  const parameters = [
    season,
    profile.scoring_profile_id,
    season,
    ...(position === "All" || position === "Flex" ? [] : [position]),
  ];
  const from = `FROM v_player_season_fantasy_points f
    JOIN season_players sp ON sp.player_id = f.player_id
    WHERE f.scoring_profile_id = ? AND f.season = ? AND f.season_type = 'REG' ${filter}`;
  const counts = await query<RowDataPacket[]>(
    `${appearances} SELECT COUNT(*) AS total ${from}`,
    parameters,
  );
  result.total = Number(counts[0].total);
  result.totalPages = Math.ceil(result.total / PAGE_SIZE);
  result.page = Math.min(requestedPage, result.totalPages || 1);
  const offset = (result.page - 1) * PAGE_SIZE;
  const rows = await query<RowDataPacket[]>(
    `${appearances}, ranked AS (
    SELECT f.player_id, f.games_played, f.total_points, sp.position, sp.team ${from}
  ) SELECT s.*, CAST(r.player_id AS CHAR) AS id, p.full_name, r.position, r.team, r.games_played, r.total_points
    FROM ranked r JOIN players p ON p.player_id = r.player_id
    JOIN v_player_season_stats s ON s.player_id = r.player_id AND s.season = ? AND s.season_type = 'REG'
    ORDER BY r.total_points DESC, p.full_name ASC, r.player_id ASC LIMIT ? OFFSET ?`,
    [...parameters, season, String(PAGE_SIZE), String(offset)],
  );
  result.players = rows.map((row, index) => ({
    id: row.id,
    rank: offset + index + 1,
    name: row.full_name,
    position: row.position,
    team: row.team,
    gamesPlayed: Number(row.games_played),
    totalPoints: Number(row.total_points),
    stats: seasonBreakdown(row, profile),
  }));
  return result;
}
