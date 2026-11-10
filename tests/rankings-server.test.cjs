const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const ts = require("typescript");

function loadTypeScript(relativePath, imports = {}) {
  const filename = path.join(__dirname, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected test import: ${name}`);
    },
    module,
    module.exports,
  );
  return module.exports;
}
const shared = loadTypeScript("lib/rankings.ts");
function server(query) {
  return loadTypeScript("lib/rankings-server.ts", {
    "server-only": {},
    "@/lib/db": { query },
    "@/lib/rankings": shared,
  });
}
const profile = {
  profile_name: "PPR",
  scoring_profile_id: 3,
  points_per_passing_yard: "0.04",
  points_per_passing_td: "4",
  points_per_interception: "-2",
  points_per_rushing_yard: "0.1",
  points_per_rushing_td: "6",
  points_per_receiving_yard: "0.1",
  points_per_receiving_td: "6",
  points_per_reception: "1",
  points_per_fumble_lost: "-2",
  points_per_two_point_conversion: "2",
  points_per_return_td: "6",
  points_per_other_td: "6",
};

test("season selection handles offseason, fallback, and no data", () => {
  assert.equal(shared.currentNflSeason(new Date("2026-01-15T12:00:00Z")), 2025);
  assert.equal(shared.currentNflSeason(new Date("2026-02-28T12:00:00Z")), 2025);
  assert.equal(shared.currentNflSeason(new Date("2026-03-01T12:00:00Z")), 2026);
  assert.equal(
    shared.defaultSeason([2023, 2025, 2024], new Date("2026-11-04T12:00:00Z")),
    2025,
  );
  assert.equal(
    shared.defaultSeason([2027, 2026], new Date("2026-11-04T12:00:00Z")),
    2026,
  );
  assert.equal(shared.defaultSeason([]), null);
});

test("empty database returns an empty first page without ranking queries", async () => {
  let calls = 0;
  const { getRankings } = server(async () => (++calls === 1 ? [] : [profile]));
  const result = await getRankings(new URLSearchParams("page=4"));
  assert.equal(result.season, null);
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 0);
  assert.deepEqual(result.players, []);
  assert.equal(calls, 2);
});

test("fewer than 20 entries clamps to page one and preserves zero-point players", async () => {
  const responses = [
    [{ season: 2025 }],
    [profile],
    [{ total: 1 }],
    [
      {
        id: "9007199254740993",
        full_name: "Zero Production",
        position: "TE",
        team: "DET",
        games_played: 1,
        total_points: "0.0000",
        pass_attempts: 0,
        pass_completions: 0,
        passing_yards: 0,
        pass_touchdowns: 0,
        interceptions_thrown: 0,
        passing_two_point_conversions: 0,
        rush_attempts: 0,
        rushing_yards: 0,
        rush_touchdowns: 0,
        rushing_two_point_conversions: 0,
        targets: 0,
        receptions: 0,
        receiving_yards: 0,
        receiving_touchdowns: 0,
        receiving_two_point_conversions: 0,
        fumbles_lost: 0,
        return_touchdowns: 0,
        other_touchdowns: 0,
      },
    ],
  ];
  const { getRankings } = server(async () => responses.shift());
  const result = await getRankings(
    new URLSearchParams("season=2025&position=TE&page=2"),
  );
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].rank, 1);
  assert.equal(result.players[0].totalPoints, 0);
  assert.ok(
    result.players[0].stats.every(
      (stat) => stat.value === 0 && (stat.points === null || stat.points === 0),
    ),
  );
  assert.equal(result.players[0].id, "9007199254740993");
});

test("unavailable scoring profile fails rather than inventing scoring", async () => {
  const { getRankings } = server(async () => []);
  await assert.rejects(
    getRankings(new URLSearchParams()),
    /Scoring profile unavailable/,
  );
});

test("API returns a safe retryable error without database details", async () => {
  const serverModule = server(async () => {
    throw new Error("private database detail");
  });
  const { GET } = loadTypeScript("app/api/player-rankings/route.ts", {
    "@/lib/rankings-server": serverModule,
  });
  const originalError = console.error;
  const logs = [];
  console.error = (message) => logs.push(message);
  try {
    const response = await GET(
      new Request("http://localhost/api/player-rankings"),
    );
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), {
      message: "Rankings couldn’t be loaded. Please try again.",
    });
    assert.ok(
      logs.every((message) => !message.includes("private database detail")),
    );
  } finally {
    console.error = originalError;
  }
});
