import { useId, useState } from "react";
import { formatPoints } from "@/lib/rankings";
import type { Player, PlayerValue } from "@/lib/trade/types";

type Props = {
  label: string;
  players: Player[];
  values?: Map<string, PlayerValue>;
  excluded: Set<string>;
  onAdd: (id: string) => void;
};

export function AssetSearch({
  label,
  players,
  values,
  excluded,
  onAdd,
}: Props) {
  const id = useId();
  const [search, setSearch] = useState("");
  const [position, setPosition] = useState("All");
  const [open, setOpen] = useState(false);
  const matches = players
    .filter(
      (player) =>
        !excluded.has(player.id) &&
        (position === "All" || player.position === position) &&
        `${player.name} ${player.team}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort(
      (a, b) =>
        (values?.get(b.id)?.value ?? 0) - (values?.get(a.id)?.value ?? 0) ||
        a.name.localeCompare(b.name),
    );
  return (
    <div className="asset-search">
      <label htmlFor={id}>{label}</label>
      <div className="asset-search-controls">
        <input
          id={id}
          type="search"
          autoComplete="off"
          placeholder="Search player or NFL team"
          value={search}
          aria-controls={`${id}-results`}
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setSearch(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
        />
        <select
          aria-label={`${label}: position`}
          value={position}
          onChange={(event) => {
            setPosition(event.target.value);
            setOpen(true);
          }}
        >
          {["All", "QB", "RB", "WR", "TE"].map((value) => (
            <option key={value}>{value}</option>
          ))}
        </select>
      </div>
      {open && (
        <div className="asset-search-results" id={`${id}-results`}>
          <div className="asset-search-status">
            <span>
              {matches.length
                ? `${matches.length} available · showing up to 8`
                : "No available players match."}
            </span>
            <button
              type="button"
              className="trade-text-button"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>
          <ul>
            {matches.slice(0, 8).map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => {
                    onAdd(player.id);
                    setSearch("");
                    setOpen(false);
                  }}
                  aria-label={`Add ${player.name}`}
                >
                  <span>
                    <strong>{player.name}</strong>
                    <small>
                      {player.position} · {player.team}
                    </small>
                  </span>
                  <span>
                    {values?.has(player.id) &&
                      formatPoints(values.get(player.id)!.value)}{" "}
                    <b aria-hidden="true">＋</b>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
