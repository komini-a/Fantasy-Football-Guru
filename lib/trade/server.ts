import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import {
  currentNflSeason,
  scoringFormats,
  type ScoringFormat,
} from "@/lib/rankings";
import { scoringStatDefinitions, seasonBreakdown } from "@/lib/rankings-server";
import type { Player, TradeData } from "./types";

export class TradeInputError extends Error {}

export function projectionPoints(
  row: RowDataPacket | undefined,
  profile: RowDataPacket,
): number | null {
  if (
    !row ||
    scoringStatDefinitions.some(
      ({ column, coefficient }) =>
        coefficient &&
        (row[column] == null || !Number.isFinite(Number(row[column]))),
    )
  )
    return null;
  return seasonBreakdown(row, profile).reduce(
    (sum, stat) => sum + (stat.points ?? 0),
    0,
  );
}

export async function getTradeData(
  params: URLSearchParams,
  now = new Date(),
): Promise<TradeData> {
  const scoring = (params.get("scoring") ?? "PPR") as ScoringFormat;
  if (!scoringFormats.includes(scoring))
    throw new TradeInputError("Invalid scoring format.");
  const season = currentNflSeason(now);
  const [profiles, progress] = await Promise.all([
    query<RowDataPacket[]>(
      "SELECT * FROM scoring_profiles WHERE profile_name IN ('PPR', 'Half PPR', 'Standard')",
    ),
    query<RowDataPacket[]>(
      "SELECT MAX(week) AS latest_week, MAX(kickoff_utc) AS latest_game FROM games WHERE season = ? AND season_type = 'REG' AND game_status = 'FINAL' AND kickoff_utc <= ?",
      [season, now],
    ),
  ]);
  const profile = profiles.find((entry) => entry.profile_name === scoring);
  if (!profile) throw new Error("Scoring profile unavailable");
  const nextWeek = Math.min(19, Number(progress[0]?.latest_week ?? 0) + 1);
  const remainingWeeks = Math.max(0, 19 - nextWeek);
  const [players, history, recent, sets] = await Promise.all([
    query<RowDataPacket[]>(
      `SELECT CAST(p.player_id AS CHAR) AS id, p.full_name, p.position,
      t.team_code, TIMESTAMPDIFF(YEAR, p.birth_date, ?) AS age, p.draft_pick, p.rookie_season, p.career_status
      FROM players p LEFT JOIN teams t ON t.team_id = p.current_team_id
      WHERE p.career_status = 'ACTIVE' OR EXISTS (
        SELECT 1 FROM player_game_stats s JOIN games g ON g.game_id = s.game_id
        WHERE s.player_id = p.player_id AND g.season BETWEEN ? AND ? AND g.season_type = 'REG' AND g.game_status = 'FINAL'
      ) ORDER BY p.full_name, p.player_id`,
      [now, season - 2, season],
    ),
    query<RowDataPacket[]>(
      `SELECT CAST(player_id AS CHAR) AS id, season, games_played, total_points
      FROM v_player_season_fantasy_points WHERE scoring_profile_id = ? AND season BETWEEN ? AND ? AND season_type = 'REG'`,
      [profile.scoring_profile_id, season - 2, season],
    ),
    query<RowDataPacket[]>(
      `WITH recent AS (
      SELECT player_id, fantasy_points, ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY week DESC, game_id DESC) AS appearance
      FROM v_player_game_fantasy_points WHERE scoring_profile_id = ? AND season = ? AND season_type = 'REG'
    ) SELECT CAST(player_id AS CHAR) AS id, AVG(fantasy_points) AS ppg, COUNT(*) AS games
      FROM recent WHERE appearance <= 4 GROUP BY player_id`,
      [profile.scoring_profile_id, season],
    ),
    query<RowDataPacket[]>(
      `SELECT projection_set_id, source, as_of_utc FROM projection_sets
      WHERE season = ? AND start_week = ? AND end_week = 18 AND as_of_utc <= ?
      ORDER BY as_of_utc DESC, projection_set_id DESC LIMIT 1`,
      [season, nextWeek, now],
    ),
  ]);
  const projections = sets.length
    ? await query<RowDataPacket[]>(
        "SELECT *, CAST(player_id AS CHAR) AS id FROM player_projections WHERE projection_set_id = ?",
        [sets[0].projection_set_id],
      )
    : [];
  const histories = new Map<string, Player["history"]>();
  history.forEach((row) => {
    const records = histories.get(row.id) ?? [];
    records.push({
      season: Number(row.season),
      games: Number(row.games_played),
      points: Number(row.total_points),
    });
    histories.set(row.id, records);
  });
  const recentById = new Map(recent.map((row) => [row.id, row]));
  const projectionById = new Map(projections.map((row) => [row.id, row]));
  const mapped: Player[] = players.map((row) => ({
    id: row.id,
    name: row.full_name,
    position: row.position,
    team: row.team_code ?? "FA / unknown",
    age: row.age === null ? null : Number(row.age),
    draftPick: row.draft_pick === null ? null : Number(row.draft_pick),
    rookieSeason: row.rookie_season === null ? null : Number(row.rookie_season),
    status: row.career_status,
    history: histories.get(row.id) ?? [],
    recentPpg: recentById.has(row.id)
      ? Number(recentById.get(row.id)!.ppg)
      : null,
    recentGames: Number(recentById.get(row.id)?.games ?? 0),
    projectedPoints: projectionPoints(projectionById.get(row.id), profile),
  }));
  const missingProjections = mapped.filter(
    (player) => player.projectedPoints === null,
  ).length;
  const warnings = [
    "Provisional model estimates, not established market prices. Age curves and draft-pick values are configurable assumptions.",
    "No live injury, depth-chart, opponent or bye-week adjustments. Verify availability before using the results.",
  ];
  if (missingProjections)
    warnings.push(
      `${missingProjections} players lack complete rest-of-season projections; estimates blend per-game history, recent form and positional priors.`,
    );
  if (mapped.some((player) => player.age === null))
    warnings.push(
      "Some birth dates are missing; those players use a neutral age curve.",
    );
  if (!remainingWeeks)
    warnings.push(
      "The regular season is complete. Current-production estimates describe a typical week, not remaining games.",
    );
  if (
    !progress[0]?.latest_game ||
    now.getTime() - new Date(progress[0].latest_game).getTime() > 14 * 86400000
  )
    warnings.push(
      "Current-season game data may be missing or stale. Refresh the existing importer.",
    );
  return {
    season,
    nextWeek,
    remainingWeeks,
    asOf: now.toISOString(),
    scoring,
    formats: scoringFormats.filter((format) =>
      profiles.some((entry) => entry.profile_name === format),
    ),
    scoringRules: scoringStatDefinitions
      .filter((stat) => stat.coefficient)
      .map((stat) => ({
        label: stat.label,
        rate: Number(profile[stat.coefficient!]),
      })),
    projectionSource: sets.length
      ? `${sets[0].source} · ${new Date(sets[0].as_of_utc).toISOString()}`
      : null,
    warnings,
    players: mapped,
  };
}
