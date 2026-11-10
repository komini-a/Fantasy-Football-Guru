import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { query } from "@/lib/db";
import { getAIService, type AIService } from "@/lib/ai/service";
import { scoringStatDefinitions } from "@/lib/rankings-server";
import { projectionPoints } from "@/lib/trade/server";
import type { ScoringFormat } from "@/lib/rankings";
import type { Player } from "@/lib/trade/types";
import { evaluationSchema, lineupContext, lineupInstructions } from "./prompt";
import { parseEvaluation, validateRoster } from "./validation";
import type { LineupData, LineupRequest } from "./types";

export async function getLineupData(
  season: number,
  scoring: ScoringFormat,
  now = new Date(),
): Promise<LineupData> {
  const profiles = await query<RowDataPacket[]>(
    "SELECT * FROM scoring_profiles WHERE profile_name = ?",
    [scoring],
  );
  const profile = profiles[0];
  if (!profile) throw new Error("Scoring profile unavailable");
  const [players, history, sets, progress] = await Promise.all([
    query<RowDataPacket[]>(
      `SELECT CAST(p.player_id AS CHAR) AS id, p.full_name, p.position,
      t.team_code, TIMESTAMPDIFF(YEAR, p.birth_date, ?) AS age,
      p.draft_pick, p.rookie_season, p.career_status
      FROM players p LEFT JOIN teams t ON t.team_id = p.current_team_id
      ORDER BY p.full_name, p.player_id`,
      [now],
    ),
    query<RowDataPacket[]>(
      `SELECT CAST(player_id AS CHAR) AS id, season, games_played, total_points
      FROM v_player_season_fantasy_points
      WHERE scoring_profile_id = ? AND season BETWEEN ? AND ? AND season_type = 'REG'`,
      [profile.scoring_profile_id, season - 2, season],
    ),
    query<RowDataPacket[]>(
      `SELECT projection_set_id, source, as_of_utc, start_week, end_week
      FROM projection_sets WHERE season = ? AND as_of_utc <= ?
      ORDER BY as_of_utc DESC, projection_set_id DESC LIMIT 1`,
      [season, now],
    ),
    query<RowDataPacket[]>(
      `SELECT MAX(kickoff_utc) AS latest_game FROM games
      WHERE season = ? AND season_type = 'REG' AND game_status = 'FINAL' AND kickoff_utc <= ?`,
      [season, now],
    ),
  ]);
  const projections = sets.length
    ? await query<RowDataPacket[]>(
        "SELECT *, CAST(player_id AS CHAR) AS id FROM player_projections WHERE projection_set_id = ?",
        [sets[0].projection_set_id],
      )
    : [];
  const histories = new Map<string, Player["history"]>();
  for (const row of history) {
    const records = histories.get(row.id) ?? [];
    records.push({
      season: Number(row.season),
      games: Number(row.games_played),
      points: Number(row.total_points),
    });
    histories.set(row.id, records);
  }
  const projectionsById = new Map(projections.map((row) => [row.id, row]));
  return {
    season,
    scoring,
    asOf: now.toISOString(),
    latestGame: progress[0]?.latest_game
      ? new Date(progress[0].latest_game).toISOString()
      : null,
    scoringRules: scoringStatDefinitions
      .filter((stat) => stat.coefficient)
      .map((stat) => ({
        label: stat.label,
        rate: Number(profile[stat.coefficient!]),
      })),
    projection: sets.length
      ? {
          source: sets[0].source,
          asOf: new Date(sets[0].as_of_utc).toISOString(),
          startWeek: Number(sets[0].start_week),
          endWeek: Number(sets[0].end_week),
        }
      : null,
    players: players.map((row) => ({
      id: row.id,
      name: row.full_name,
      position: row.position,
      team: row.team_code ?? "FA / unknown",
      age: row.age == null ? null : Number(row.age),
      draftPick: row.draft_pick == null ? null : Number(row.draft_pick),
      rookieSeason:
        row.rookie_season == null ? null : Number(row.rookie_season),
      status: row.career_status,
      history: histories.get(row.id) ?? [],
      recentPpg: null,
      recentGames: 0,
      projectedPoints: projectionPoints(projectionsById.get(row.id), profile),
    })),
  };
}

export async function evaluateLineup(
  request: LineupRequest,
  data: LineupData,
  signal?: AbortSignal,
  service: AIService = getAIService(),
) {
  validateRoster(request, data.players);
  return parseEvaluation(
    await service.generateJson({
      instructions: lineupInstructions,
      context: lineupContext(request, data),
      schema: evaluationSchema,
      signal,
    }),
  );
}
