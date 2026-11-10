const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function load(relativePath, overrides = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)((name) => {
    if (name in overrides) return overrides[name];
    if (name === "server-only") return {};
    const target = name.startsWith("@/") ? name.slice(2) : path.join(path.dirname(relativePath), name);
    return load(`${target}.ts`, overrides);
  }, module, module.exports);
  return module.exports;
}
const { DEFAULT_SETTINGS, GRADE_THRESHOLDS } = load("lib/trade/config.ts");
const { valuePlayers, pickValue, picksAllowed, valueAssets } = load("lib/trade/valuation.ts");
const { assessRoster, evaluateTrade, validateTrade, packageValue, gradeFor } = load("lib/trade/evaluation.ts");
function player(id, position, ppg, age = 25) {
  return { id, name: id, position, team: "DET", age, draftPick: 10, rookieSeason: 2025, status: "ACTIVE", history: [{ season: 2026, games: 8, points: ppg * 8 }], recentPpg: ppg, recentGames: 4, projectedPoints: ppg * 10 };
}
const players = [player("Henry", "RB", 22, 32), player("McMillan", "WR", 17, 23), player("RB starter", "RB", 24), player("WR starter", "WR", 23), player("QB", "QB", 20), player("TE", "TE", 12)];
const data = { season: 2026, nextWeek: 9, remainingWeeks: 10, asOf: "2026-11-04", scoring: "PPR", formats: ["PPR"], scoringRules: [], projectionSource: "test fixture", warnings: [], players };
const asset = (playerId) => ({ kind: "player", playerId });
const team = (assets, roster = null) => ({ assets, roster: roster ?? [], rosterEnabled: roster !== null });
const pick = { kind: "pick", id: "pick-1", year: 2027, round: 1, draftType: "rookie", slot: null, range: "mid", origin: 1 };
const dynasty = { ...DEFAULT_SETTINGS, league: "dynasty" };

test("league changes revalue older veterans and young prospects, with bounded full precision values", () => {
  const redraft = valuePlayers(data, DEFAULT_SETTINGS);
  const longTerm = valuePlayers(data, dynasty);
  assert.ok(redraft.get("Henry").value > redraft.get("McMillan").value);
  assert.ok(longTerm.get("Henry").value < longTerm.get("McMillan").value);
  for (const setting of [DEFAULT_SETTINGS, dynasty, { ...dynasty, league: "keeper" }]) {
    for (const value of valuePlayers(data, setting).values()) assert.ok(Number.isFinite(value.value) && value.value >= 1 && value.value <= 100);
  }
  assert.notEqual(longTerm.get("Henry").value, Number(longTerm.get("Henry").value.toFixed(2)));
});

test("keeper limits and costs change future weighting", () => {
  const redraft = valuePlayers(data, DEFAULT_SETTINGS).get("Henry").value;
  const keeper = { ...DEFAULT_SETTINGS, league: "keeper", keeperLimit: 8, keeperCost: 0 };
  assert.ok(valuePlayers(data, keeper).get("Henry").value < redraft);
  assert.equal(valuePlayers(data, { ...keeper, keeperLimit: 0 }).get("Henry").value, redraft);
  assert.equal(valuePlayers(data, { ...keeper, keeperCost: 100 }).get("Henry").value, redraft);
});

test("pick eligibility follows league rules and blocks results after switching to redraft", () => {
  assert.equal(picksAllowed(DEFAULT_SETTINGS), false);
  assert.equal(picksAllowed(dynasty), true);
  assert.equal(picksAllowed({ ...dynasty, league: "keeper", keeperPicks: false }), false);
  assert.equal(picksAllowed({ ...dynasty, league: "keeper", keeperPicks: true }), true);
  const teams = [team([asset("McMillan"), pick]), team([asset("Henry")])];
  assert.ok(evaluateTrade(teams, dynasty, data).result);
  assert.equal(evaluateTrade(teams, DEFAULT_SETTINGS, data).result, null);
});

test("rookie and full redraft curves differ, earlier picks beat later and distant picks discount", () => {
  assert.notEqual(pickValue(pick, dynasty, 2026), pickValue({ ...pick, draftType: "redraft" }, dynasty, 2026));
  assert.ok(pickValue({ ...pick, slot: 1 }, dynasty, 2026) > pickValue({ ...pick, slot: 12 }, dynasty, 2026));
  assert.ok(pickValue({ ...pick, range: "early" }, dynasty, 2026) > pickValue({ ...pick, range: "late" }, dynasty, 2026));
  assert.ok(pickValue(pick, dynasty, 2026) > pickValue({ ...pick, year: 2030 }, dynasty, 2026));
});

test("invalid years, slots, rounds, duplicate picks and player ownership are rejected", () => {
  const errors = (first, second = [asset("Henry")]) => validateTrade([team(first), team(second)], dynasty, data);
  for (const invalid of [{ ...pick, year: 2026 }, { ...pick, slot: 13 }, { ...pick, round: 5 }, { ...pick, origin: 33 }]) assert.ok(errors([invalid]).length);
  assert.ok(errors([pick], [{ ...pick, id: "another-id" }]).some((error) => error.includes("already")));
  assert.ok(errors([asset("Henry")]).some((error) => error.includes("only once")));
  assert.ok(validateTrade([team([asset("McMillan")], ["Henry"]), team([asset("Henry")])], dynasty, data).length);
  assert.ok(validateTrade([team([asset("McMillan")], ["McMillan", "QB"]), team([asset("Henry")], ["Henry", "QB"])], dynasty, data).length);
});

test("uneven packages do not equate a pile of bench assets with an elite player", () => {
  assert.ok(packageValue([20, 20, 20, 20]) < packageValue([80]));
  assert.ok(Math.abs(packageValue([80]) - 80) < 1e-10);
  assert.ok(Math.abs(packageValue([30, 40]) - packageValue([40, 30])) < 1e-10);
});

test("a balanced exchange can benefit both rosters while keeping base values constant", () => {
  const balanced = { ...data, players: [player("RB1", "RB", 24), player("RB2", "RB", 18), player("WR1", "WR", 24), player("WR2", "WR", 18)] };
  const settings = { ...DEFAULT_SETTINGS, lineup: { QB: 0, RB: 1, WR: 1, TE: 0, FLEX: 0, SUPERFLEX: 0 } };
  const teams = [team([asset("RB2")], ["RB1", "RB2"]), team([asset("WR2")], ["WR1", "WR2"])];
  const contextual = evaluateTrade(teams, settings, balanced).result;
  const plain = evaluateTrade(teams.map((side) => ({ ...side, rosterEnabled: false })), settings, balanced).result;
  assert.equal(contextual.fairness, "Balanced exchange");
  for (let i = 0; i < 2; i++) {
    assert.ok(contextual.teams[i].score > plain.teams[i].score);
    assert.ok(contextual.teams[i].after.starterPoints > contextual.teams[i].before.starterPoints);
    assert.equal(contextual.teams[i].sent, plain.teams[i].sent);
  }
});

test("lineup fills dedicated slots before flex and never starts a player twice", () => {
  const values = valuePlayers(data, DEFAULT_SETTINGS);
  const lineup = assessRoster(players.map((p) => p.id), data, values, { QB: 1, RB: 1, WR: 1, TE: 0, FLEX: 1, SUPERFLEX: 1 });
  assert.equal(lineup.starters.length, 5);
  assert.equal(new Set(lineup.starters.map((p) => p.playerId)).size, 5);
  assert.equal(lineup.starters.find((p) => p.slot === "QB").playerId, "QB");
});

test("totals retain precision and grades follow shared boundaries", () => {
  const teams = [team([asset("Henry"), asset("QB")]), team([asset("McMillan")])];
  const values = valuePlayers(data, dynasty);
  const result = evaluateTrade(teams, dynasty, data).result;
  assert.equal(result.teams[0].sent, values.get("Henry").value + values.get("QB").value);
  assert.equal(result.teams[0].sent, result.teams[1].received);
  for (const entry of GRADE_THRESHOLDS) assert.equal(gradeFor(entry.minimum), entry.grade);
});

test("missing inputs produce explicit fallback notes, including zero production", () => {
  const sparse = { ...data, players: [{ ...player("unknown", "TE", 0), history: [], recentPpg: null, recentGames: 0, age: null, draftPick: null, projectedPoints: null }] };
  const values = valuePlayers(sparse, dynasty);
  assert.ok(values.get("unknown").notes.some((note) => note.includes("Age unknown")));
  assert.ok(values.get("unknown").notes.some((note) => note.includes("No recent")));
  assert.ok(values.get("unknown").value >= 1);
  assert.equal(valuePlayers({ ...data, players: [player("zero", "TE", 0)] }, dynasty).get("zero").weeklyPoints, 0);
});

test("server rejects invalid scoring and treats partial projections as missing", async () => {
  let calls = 0;
  const server = load("lib/trade/server.ts", { "@/lib/db": { query: async () => { calls++; return []; } } });
  await assert.rejects(server.getTradeData(new URLSearchParams("scoring=unknown")), /Invalid scoring/);
  assert.equal(calls, 0);
  assert.equal(server.projectionPoints({ passing_yards: 100 }, {}), null);
  await assert.rejects(server.getTradeData(new URLSearchParams()), /Scoring profile unavailable/);
});

test("API returns safe errors without exposing database details", async () => {
  class TradeInputError extends Error {}
  const route = load("app/api/trade-calculator/route.ts", { "@/lib/trade/server": { TradeInputError, getTradeData: async () => { throw new Error("private database details"); } } });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await route.GET(new Request("http://localhost/api/trade-calculator"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.ok(!(await response.text()).includes("private"));
  } finally { console.error = original; }
});
