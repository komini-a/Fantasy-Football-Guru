import assert from "node:assert/strict";
import { test } from "node:test";

const base = process.env.RANKINGS_TEST_URL ?? "http://127.0.0.1:3000";
async function rankings(parameters = {}) {
  const response = await fetch(
    `${base}/api/player-rankings?${new URLSearchParams(parameters)}`,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  return response.json();
}
function checkPage(data) {
  assert.ok(data.players.length <= 20);
  for (const [index, player] of data.players.entries()) {
    assert.equal(player.rank, (data.page - 1) * 20 + index + 1);
    if (index)
      assert.ok(data.players[index - 1].totalPoints >= player.totalPoints);
    const contributions = player.stats.reduce(
      (sum, stat) => sum + (stat.points ?? 0),
      0,
    );
    assert.ok(
      Math.abs(contributions - player.totalPoints) < 0.00001,
      `${player.name}: breakdown must match total`,
    );
  }
}

test("defaults, descending totals, page boundaries, and scoring contributions", async () => {
  const first = await rankings();
  assert.equal(first.scoring, "PPR");
  assert.equal(first.position, "All");
  const date = new Date();
  const current = date.getUTCFullYear() - (date.getUTCMonth() < 2 ? 1 : 0);
  assert.equal(
    first.season,
    first.seasons.includes(current)
      ? current
      : first.seasons.length
        ? Math.max(...first.seasons)
        : null,
  );
  checkPage(first);
  if (!first.total) return;
  assert.equal(first.players.length, Math.min(20, first.total));
  if (first.totalPages > 1) {
    const second = await rankings({ season: first.season, page: 2 });
    checkPage(second);
    assert.equal(second.players[0].rank, 21);
    assert.ok(
      first.players.at(-1).totalPoints >= second.players[0].totalPoints,
    );
    assert.ok(
      second.players.every(
        (player) =>
          !first.players.some((previous) => previous.id === player.id),
      ),
    );
  }
  const last = await rankings({ season: first.season, page: 1000000 });
  checkPage(last);
  assert.equal(last.page, first.totalPages);
  assert.equal(last.players.length, first.total % 20 || 20);
  assert.equal(last.players.at(-1).rank, first.total);
});

test("each season, position, Flex membership, and all existing scoring profiles", async () => {
  const initial = await rankings();
  for (const season of initial.seasons) {
    const totals = {};
    for (const position of ["QB", "RB", "WR", "TE", "Flex"]) {
      const data = await rankings({ season, position });
      checkPage(data);
      totals[position] = data.total;
      assert.ok(
        data.players.every((player) =>
          position === "Flex"
            ? ["RB", "WR", "TE"].includes(player.position)
            : player.position === position,
        ),
      );
    }
    assert.equal(totals.Flex, totals.RB + totals.WR + totals.TE);
    for (const scoring of initial.formats) {
      const data = await rankings({ season, scoring });
      assert.equal(data.scoring, scoring);
      checkPage(data);
      for (const player of data.players) {
        const reception = player.stats.find(
          (stat) => stat.label === "Receptions",
        );
        assert.equal(
          reception.rate,
          scoring === "PPR" ? 1 : scoring === "Half PPR" ? 0.5 : 0,
        );
      }
    }
  }
});

test("invalid query parameters return safe client errors", async () => {
  for (const parameters of [
    { page: 0 },
    { page: "1.5" },
    { page: 1000001 },
    { season: "nope" },
    { season: 1900 },
    { position: "K" },
    { position: "QB' OR 1=1" },
    { scoring: "Invented" },
  ]) {
    const response = await fetch(
      `${base}/api/player-rankings?${new URLSearchParams(parameters)}`,
    );
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).message, "string");
  }
});
