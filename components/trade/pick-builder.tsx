import { useState } from "react";
import { MODEL } from "@/lib/trade/config";
import type { DraftType, LeagueSettings, PickAsset } from "@/lib/trade/types";

type Props = {
  settings: LeagueSettings;
  season: number;
  onAdd: (pick: PickAsset) => void;
};

export function PickBuilder({ settings, season, onAdd }: Props) {
  const [year, setYear] = useState(season + 1);
  const [round, setRound] = useState(1);
  const [draftType, setDraftType] = useState<DraftType>("rookie");
  const [placement, setPlacement] = useState("mid");
  const [origin, setOrigin] = useState(1);
  const teamCount = Math.max(4, Math.min(32, Math.trunc(settings.teams) || 12));
  return (
    <details className="trade-details pick-builder">
      <summary>Add a future draft pick</summary>
      <div className="trade-fields">
        <label>
          Draft year
          <select
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {Array.from({ length: 5 }, (_, index) => season + index + 1).map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Draft type
          <select
            value={draftType}
            onChange={(event) => {
              setDraftType(event.target.value as DraftType);
              setRound(1);
            }}
          >
            <option value="rookie">Rookie draft</option>
            <option value="redraft">Full redraft</option>
          </select>
        </label>
        <label>
          Round
          <select
            value={round}
            onChange={(event) => setRound(Number(event.target.value))}
          >
            {Array.from(
              {
                length:
                  draftType === "rookie"
                    ? MODEL.rookieRoundValues.length
                    : MODEL.redraftRoundValues.length,
              },
              (_, index) => (
                <option key={index + 1}>{index + 1}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Pick placement
          <select
            value={placement}
            onChange={(event) => setPlacement(event.target.value)}
          >
            <option value="early">Estimated early</option>
            <option value="mid">Estimated mid</option>
            <option value="late">Estimated late</option>
            {Array.from({ length: teamCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Exact {round}.{String(index + 1).padStart(2, "0")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Original pick owner
          <select
            value={origin}
            onChange={(event) => setOrigin(Number(event.target.value))}
          >
            {Array.from({ length: teamCount }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                League team {index + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="trade-help">
        Exact numbers are slots within a round. Give each original owner a
        unique team number, including picks acquired earlier.
      </p>
      <button
        type="button"
        className="button button-dark"
        onClick={() =>
          onAdd({
            kind: "pick",
            id: crypto.randomUUID(),
            year,
            round,
            draftType,
            origin,
            slot: /^\d+$/.test(placement) ? Number(placement) : null,
            range: /^\d+$/.test(placement)
              ? "mid"
              : (placement as PickAsset["range"]),
          })
        }
      >
        Add pick
      </button>
    </details>
  );
}
