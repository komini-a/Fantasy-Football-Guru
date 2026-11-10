import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.TRADE_TEST_URL ?? "http://127.0.0.1:3000";

test("live API returns a complete, numeric catalog for each scoring profile", async () => {
  const catalogs = [];
  for (const scoring of ["PPR", "Half PPR", "Standard"]) {
    const response = await fetch(`${base}/api/trade-calculator?${new URLSearchParams({ scoring })}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.scoring, scoring);
    assert.ok(data.players.length > 0);
    assert.equal(new Set(data.players.map((player) => player.id)).size, data.players.length);
    for (const player of data.players) {
      assert.equal(typeof player.id, "string");
      assert.ok(player.age === null || Number.isFinite(player.age));
      assert.ok(player.recentPpg === null || Number.isFinite(player.recentPpg));
      assert.ok(player.projectedPoints === null || Number.isFinite(player.projectedPoints));
      assert.ok(player.history.every((history) => Number.isFinite(history.points) && history.games > 0));
    }
    const reception = data.scoringRules.find((rule) => rule.label === "Receptions");
    assert.equal(reception.rate, scoring === "PPR" ? 1 : scoring === "Half PPR" ? 0.5 : 0);
    catalogs.push(data);
  }
  assert.deepEqual(catalogs[0].players.map((p) => p.id), catalogs[2].players.map((p) => p.id));
  assert.ok(catalogs[0].players.some((p, index) => p.history.some((h, season) => h.points > catalogs[2].players[index].history[season].points)));
});

test("invalid scoring is rejected and calculator page renders", async () => {
  const bad = await fetch(`${base}/api/trade-calculator?scoring=invalid`);
  assert.equal(bad.status, 400);
  const response = await fetch(`${base}/trade-calculator`);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("Trade Calculator"));
  assert.ok(html.includes("Standard Redraft"));
  assert.ok(html.includes("Scoring format"));
});
