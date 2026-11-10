import { GRADE_THRESHOLDS, MODEL } from "./config";
import {
  assetKey,
  type Asset,
  type LeagueSettings,
  type Lineup,
  type PlayerValue,
  type Team,
  type TradeData,
} from "./types";
import { picksAllowed, valueAssets, valuePlayers } from "./valuation";

export function validateTrade(
  teams: Team[],
  settings: LeagueSettings,
  data: TradeData,
): string[] {
  const errors: string[] = [];
  if (
    !Number.isInteger(settings.teams) ||
    settings.teams < 4 ||
    settings.teams > 32
  )
    errors.push("League size must be 4–32 teams.");
  if (
    !Number.isInteger(settings.keeperLimit) ||
    settings.keeperLimit < 0 ||
    settings.keeperLimit > 30
  )
    errors.push("Keeper limit must be 0–30.");
  if (
    !Number.isFinite(settings.keeperCost) ||
    settings.keeperCost < 0 ||
    settings.keeperCost > 100
  )
    errors.push("Keeper cost must be 0–100%.");
  if (
    Object.values(settings.lineup).some(
      (count) => !Number.isInteger(count) || count < 0 || count > 6,
    ) ||
    !Object.values(settings.lineup).some(Boolean)
  )
    errors.push("Set at least one starter; each lineup slot must be 0–6.");
  const playerIds = new Set(data.players.map((player) => player.id));
  const assetIds = new Set<string>();
  const picks: Extract<Asset, { kind: "pick" }>[] = [];
  const rosterOwners = new Map<string, number>();
  teams.forEach((team, index) => {
    const name = index === 0 ? "Your Team" : "Other Team";
    if (!team.assets.length)
      errors.push(`${name}: add at least one asset to send.`);
    if (team.rosterEnabled) {
      if (!team.roster.length)
        errors.push(`${name}: add a full roster or turn roster context off.`);
      for (const id of team.roster) {
        if (!playerIds.has(id))
          errors.push(`${name}: a roster player is unavailable.`);
        if (rosterOwners.has(id))
          errors.push(
            "A player can belong to only one roster and cannot be repeated.",
          );
        rosterOwners.set(id, index);
      }
    }
    for (const asset of team.assets) {
      if (assetIds.has(assetKey(asset)))
        errors.push("Each asset can appear only once in the trade.");
      assetIds.add(assetKey(asset));
      if (asset.kind === "player") {
        if (!playerIds.has(asset.playerId))
          errors.push(`${name}: a selected player is unavailable.`);
        if (team.rosterEnabled && !team.roster.includes(asset.playerId))
          errors.push(`${name}: outgoing players must belong to its roster.`);
      } else {
        if (!picksAllowed(settings))
          errors.push(
            "Future picks are not allowed by the selected league rules. Remove them or change the rules.",
          );
        const maxRound =
          asset.draftType === "rookie"
            ? MODEL.rookieRoundValues.length
            : MODEL.redraftRoundValues.length;
        if (
          !Number.isInteger(asset.year) ||
          asset.year <= data.season ||
          asset.year > data.season + 5
        )
          errors.push("Picks must be in the next five draft years.");
        if (
          !Number.isInteger(asset.round) ||
          asset.round < 1 ||
          asset.round > maxRound
        )
          errors.push(`Pick round must be 1–${maxRound} for its draft type.`);
        if (
          asset.slot !== null &&
          (!Number.isInteger(asset.slot) ||
            asset.slot < 1 ||
            asset.slot > settings.teams)
        )
          errors.push("Exact pick slot must be within the league size.");
        if (
          !Number.isInteger(asset.origin) ||
          asset.origin < 1 ||
          asset.origin > settings.teams
        )
          errors.push("Original pick owner must be within the league size.");
        if (
          picks.some(
            (pick) =>
              pick.year === asset.year &&
              pick.draftType === asset.draftType &&
              pick.round === asset.round &&
              (pick.origin === asset.origin ||
                (pick.slot !== null && pick.slot === asset.slot)),
          )
        )
          errors.push(
            "This draft pick is already in the trade (same original owner or exact slot).",
          );
        picks.push(asset);
      }
    }
  });
  teams.forEach((team, index) =>
    team.assets.forEach((asset) => {
      if (
        asset.kind === "player" &&
        rosterOwners.has(asset.playerId) &&
        rosterOwners.get(asset.playerId) !== index
      )
        errors.push("An outgoing player belongs to the other team's roster.");
    }),
  );
  return [...new Set(errors)];
}

export function packageValue(values: number[]): number {
  // An L-p norm rewards quality without counting every bench asset at face value.
  return (
    values.reduce((sum, value) => sum + value ** MODEL.packageExponent, 0) **
    (1 / MODEL.packageExponent)
  );
}

export function gradeFor(score: number): string {
  return GRADE_THRESHOLDS.find((threshold) => score >= threshold.minimum)!
    .grade;
}

export function assessRoster(
  ids: string[],
  data: TradeData,
  values: Map<string, PlayerValue>,
  lineup: Lineup,
) {
  const remaining = data.players
    .filter((player) => ids.includes(player.id))
    .sort(
      (a, b) =>
        values.get(b.id)!.weeklyPoints - values.get(a.id)!.weeklyPoints ||
        a.id.localeCompare(b.id),
    );
  const starters: {
    slot: string;
    playerId: string;
    name: string;
    points: number;
  }[] = [];
  const holes: string[] = [];
  for (const slot of ["QB", "RB", "WR", "TE", "FLEX", "SUPERFLEX"] as const) {
    for (let count = 0; count < lineup[slot]; count++) {
      const index = remaining.findIndex(
        (player) =>
          slot === "SUPERFLEX" ||
          (slot === "FLEX"
            ? player.position !== "QB"
            : player.position === slot),
      );
      if (index < 0) holes.push(slot);
      else {
        const [player] = remaining.splice(index, 1);
        starters.push({
          slot,
          playerId: player.id,
          name: player.name,
          points: values.get(player.id)!.weeklyPoints,
        });
      }
    }
  }
  const starterPoints = starters.reduce(
    (sum, player) => sum + player.points,
    0,
  );
  const depthPoints = (["QB", "RB", "WR", "TE"] as const).reduce(
    (total, position) =>
      total +
      remaining
        .filter((player) => player.position === position)
        .slice(0, 2)
        .reduce((sum, player) => sum + values.get(player.id)!.weeklyPoints, 0),
    0,
  );
  return {
    starters,
    holes,
    starterPoints,
    depthPoints,
    benchCount: remaining.length,
    utility: starterPoints + MODEL.benchWeight * depthPoints,
  };
}

export function evaluateTrade(
  teams: Team[],
  settings: LeagueSettings,
  data: TradeData,
) {
  const errors = validateTrade(teams, settings, data);
  if (errors.length) return { errors, result: null };
  const values = valuePlayers(data, settings);
  const assets = teams.map((team) =>
    valueAssets(team.assets, data, settings, values),
  );
  const totals = assets.map((side) =>
    side.reduce((sum, asset) => sum + asset.value, 0),
  );
  const packages = assets.map((side) =>
    packageValue(side.map((asset) => asset.value)),
  );
  const gap = Math.abs(packages[0] - packages[1]) / Math.max(...packages);
  const fairness =
    gap <= MODEL.fairnessBalanced
      ? "Balanced exchange"
      : gap <= MODEL.fairnessSlight
        ? "Slight value imbalance"
        : "Significant value imbalance";
  const results = teams.map((team, index) => {
    const other = 1 - index;
    const valueEdge =
      (packages[other] - packages[index]) / Math.max(...packages);
    const outgoing = team.assets.flatMap((asset) =>
      asset.kind === "player" ? [asset.playerId] : [],
    );
    const incoming = teams[other].assets.flatMap((asset) =>
      asset.kind === "player" ? [asset.playerId] : [],
    );
    const before = team.rosterEnabled
      ? assessRoster(team.roster, data, values, settings.lineup)
      : null;
    const after = before
      ? assessRoster(
          [...team.roster.filter((id) => !outgoing.includes(id)), ...incoming],
          data,
          values,
          settings.lineup,
        )
      : null;
    const rosterEdge =
      before && after
        ? (after.utility - before.utility) /
          Math.max(20, before.utility, after.utility)
        : 0;
    const score = before
      ? (1 - MODEL.rosterGradeWeight) * valueEdge +
        MODEL.rosterGradeWeight * rosterEdge
      : valueEdge;
    const explanations = [
      Math.abs(valueEdge) <= MODEL.fairnessBalanced
        ? "Receives comparable package-adjusted value."
        : valueEdge > 0
          ? "Receives more package-adjusted value than it sends."
          : "Gives up more package-adjusted value than it receives.",
    ];
    if (before && after) {
      const delta = after.starterPoints - before.starterPoints;
      explanations.push(
        `Estimated starting lineup ${delta >= 0 ? "gains" : "loses"} ${Math.abs(delta).toFixed(2)} points per week.`,
      );
      const newStarters = after.starters.filter((starter) =>
        incoming.includes(starter.playerId),
      );
      explanations.push(
        newStarters.length
          ? `Incoming likely starters: ${newStarters.map((player) => player.name).join(", ")}.`
          : "Incoming players mainly add bench depth or future value.",
      );
      if (after.holes.length)
        explanations.push(
          `Unfilled starting slots after trade: ${after.holes.join(", ")}.`,
        );
      explanations.push(
        `Bench depth: ${before.benchCount} → ${after.benchCount} players. Roster limits and required cuts are not modeled.`,
      );
    } else
      explanations.push(
        "Value-based grade only; team needs were not considered.",
      );
    if (teams[other].assets.some((asset) => asset.kind === "pick"))
      explanations.push(
        "Incoming draft capital adds future value but no current starting points.",
      );
    if (team.assets.length !== teams[other].assets.length)
      explanations.push(
        "Package adjustment discounts accumulated low-value assets; raw totals alone do not determine fairness.",
      );
    return {
      sent: totals[index],
      received: totals[other],
      adjustedSent: packages[index],
      adjustedReceived: packages[other],
      grade: gradeFor(score),
      score,
      explanations,
      before,
      after,
    };
  });
  return {
    errors,
    result: {
      fairness,
      gap,
      favoredTeam:
        packages[0] === packages[1]
          ? null
          : packages[0] < packages[1]
            ? "Your Team"
            : "Other Team",
      teams: results,
    },
  };
}

export type TradeResult = NonNullable<
  ReturnType<typeof evaluateTrade>["result"]
>;
