import { MODEL } from "./config";
import type {
  Asset,
  LeagueSettings,
  PickAsset,
  Player,
  PlayerValue,
  TradeData,
  ValuedAsset,
} from "./types";

export const clamp = (value: number, min = 1, max = 100) =>
  Math.max(min, Math.min(max, value));
export const picksAllowed = (settings: LeagueSettings) =>
  settings.league === "dynasty" ||
  (settings.league === "keeper" && settings.keeperPicks);

function weeklyEstimate(player: Player, data: TradeData): number {
  if (player.projectedPoints !== null && data.remainingWeeks)
    return Math.max(0, player.projectedPoints / data.remainingWeeks);
  const prior = MODEL.priorPpg[player.position];
  let points = prior * MODEL.priorGames;
  let games = MODEL.priorGames;
  for (const history of player.history) {
    const weight = MODEL.historyDecay ** (data.season - history.season);
    points += history.points * weight;
    games += history.games * weight;
  }
  const recentWeight = MODEL.recentWeight * Math.min(1, player.recentGames / 4);
  let estimate =
    (points / games) * (1 - recentWeight) +
    (player.recentPpg ?? points / games) * recentWeight;
  const latest = Math.max(...player.history.map((history) => history.season));
  if (Number.isFinite(latest))
    estimate *= MODEL.staleSeasonDecay ** Math.max(0, data.season - latest);
  if (player.status === "RETIRED") return 0;
  if (player.status === "INACTIVE") estimate *= 0.7;
  return Math.max(0, estimate);
}

export function valuePlayers(
  data: TradeData,
  settings: LeagueSettings,
): Map<string, PlayerValue> {
  const weekly = new Map(
    data.players.map((player) => [player.id, weeklyEstimate(player, data)]),
  );
  const replacements = new Map<string, number>();
  for (const position of ["QB", "RB", "WR", "TE"] as const) {
    const flexShare =
      position === "QB"
        ? settings.lineup.SUPERFLEX * 0.8
        : (settings.lineup.FLEX + settings.lineup.SUPERFLEX * 0.2) / 3;
    const rank = Math.max(
      1,
      Math.round(settings.teams * (settings.lineup[position] + flexShare)),
    );
    const scores = data.players
      .filter((player) => player.position === position)
      .map((player) => weekly.get(player.id)!)
      .sort((a, b) => b - a);
    replacements.set(position, scores[rank] ?? MODEL.priorPpg[position]);
  }
  return new Map(
    data.players.map((player) => {
      const weeklyPoints = weekly.get(player.id)!;
      const production = clamp(
        weeklyPoints / MODEL.elitePpg[player.position],
        0,
        1,
      );
      const surplus = Math.max(
        0,
        weeklyPoints - replacements.get(player.position)!,
      );
      const current = clamp(
        100 *
          (MODEL.weeklyValueWeight * production +
            MODEL.surplusValueWeight *
              (1 - Math.exp(-surplus / MODEL.replacementScale))),
      );
      const notes: string[] = [];
      if (player.projectedPoints === null)
        notes.push(
          "Provisional production estimate; no rest-of-season projection.",
        );
      if (!player.history.length)
        notes.push("No recent game history; positional prior used.");
      else if (
        !player.history.some((history) => history.season === data.season)
      )
        notes.push(
          "No current-season appearances; older production is discounted.",
        );
      if (player.age === null)
        notes.push("Age unknown; neutral career curve used.");
      if (player.draftPick === null)
        notes.push("NFL draft capital unavailable; no prospect bonus.");
      if (player.status !== "ACTIVE")
        notes.push(
          `Career status: ${player.status.toLowerCase()}; verify availability.`,
        );
      let future = 0;
      let weightTotal = 0;
      for (let year = 1; year <= MODEL.futureSeasons; year++) {
        const ageFactor =
          player.age === null
            ? 1
            : Math.max(
                0.2,
                1 -
                  Math.max(
                    0,
                    player.age + year - MODEL.declineAge[player.position],
                  ) *
                    MODEL.annualDecline[player.position],
              );
        const weight = MODEL.futureDiscount ** year;
        future += current * ageFactor * weight;
        weightTotal += weight;
      }
      future /= weightTotal;
      if (
        player.rookieSeason !== null &&
        data.season - player.rookieSeason <= 2 &&
        player.draftPick !== null
      ) {
        future +=
          MODEL.youthCapitalBonus * Math.exp(-(player.draftPick - 1) / 64);
      }
      const futureWeight =
        settings.league === "dynasty"
          ? MODEL.dynastyFutureWeight
          : settings.league === "keeper"
            ? MODEL.keeperFutureWeight *
              Math.min(1, settings.keeperLimit / MODEL.keeperLimitScale) *
              (1 - settings.keeperCost / 100)
            : 0;
      const value =
        player.status === "RETIRED"
          ? 1
          : clamp(current * (1 - futureWeight) + future * futureWeight);
      return [player.id, { value, weeklyPoints, notes }];
    }),
  );
}

export function pickValue(
  pick: PickAsset,
  settings: LeagueSettings,
  season: number,
): number {
  const rounds =
    pick.draftType === "rookie"
      ? MODEL.rookieRoundValues
      : MODEL.redraftRoundValues;
  const relativeSlot =
    pick.slot === null
      ? { early: 0.15, mid: 0.5, late: 0.85 }[pick.range]
      : (pick.slot - 1) / (settings.teams - 1);
  const slotFactor = 1 + MODEL.pickSlotSpread * (0.5 - relativeSlot) * 2;
  return clamp(
    (rounds[pick.round - 1] ?? 1) *
      slotFactor *
      MODEL.futureDiscount ** Math.max(0, pick.year - season - 1),
  );
}

export function describePick(pick: PickAsset): string {
  const placement =
    pick.slot === null
      ? pick.range
      : `${pick.round}.${String(pick.slot).padStart(2, "0")}`;
  return `${pick.year} ${pick.draftType === "rookie" ? "rookie" : "full redraft"} · Round ${pick.round} · ${placement}`;
}

export function valueAssets(
  assets: Asset[],
  data: TradeData,
  settings: LeagueSettings,
  values: Map<string, PlayerValue>,
): ValuedAsset[] {
  return assets.flatMap<ValuedAsset>((asset) => {
    if (asset.kind === "pick")
      return [
        {
          asset,
          name: describePick(asset),
          detail: `Original team ${asset.origin} · Provisional pick estimate`,
          value: pickValue(asset, settings, data.season),
          notes: [
            "Assumed draft curve; no market-price feed or draft-class adjustment.",
          ],
        },
      ];
    const player = data.players.find((entry) => entry.id === asset.playerId);
    const value = values.get(asset.playerId);
    return player && value
      ? [
          {
            asset,
            name: player.name,
            detail: `${player.position} · ${player.team}${player.age === null ? "" : ` · Age ${player.age}`}`,
            value: value.value,
            notes: value.notes,
          },
        ]
      : [];
  });
}
