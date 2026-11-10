import { AssetSearch } from "@/components/trade/asset-search";
import { eligibleForSlot, type RosterSlot } from "@/lib/lineup/types";
import type { Player } from "@/lib/trade/types";

type Props = {
  label: string;
  slot?: RosterSlot;
  selected: string[];
  players: Player[];
  excluded: Set<string>;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
};

export function RosterEntry({
  label,
  slot,
  selected,
  players,
  excluded,
  onAdd,
  onRemove,
}: Props) {
  return (
    <section className="lineup-slot" aria-label={label}>
      <h3>{label}</h3>
      <ul className="roster-list">
        {selected.map((id) => {
          const player = players.find((entry) => entry.id === id);
          return (
            <li key={id}>
              <span>
                <strong>
                  {player?.name ?? "Unavailable player — remove or replace"}
                </strong>
                {player && (
                  <small>
                    {player.position} · {player.team}
                  </small>
                )}
              </span>
              <button
                type="button"
                className="trade-text-button"
                aria-label={`Remove ${player?.name ?? "player"} from ${label}`}
                onClick={() => onRemove(id)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      {(!slot || selected.length === 0) && selected.length < 30 && (
        <AssetSearch
          label={`Add player to ${label}`}
          players={
            slot
              ? players.filter((player) =>
                  eligibleForSlot(player.position, slot),
                )
              : players
          }
          excluded={excluded}
          onAdd={onAdd}
        />
      )}
    </section>
  );
}
