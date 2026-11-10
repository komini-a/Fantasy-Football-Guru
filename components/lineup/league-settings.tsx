import { currentNflSeason, scoringFormats } from "@/lib/rankings";
import { rosterSlots, type LineupSettings } from "@/lib/lineup/types";

type Props = {
  settings: LineupSettings;
  onChange: (change: Partial<LineupSettings>) => void;
};

export function LeagueSettings({ settings, onChange }: Props) {
  return (
    <section
      className="trade-panel trade-settings"
      aria-label="League settings"
    >
      <div className="trade-section-heading">
        <h2>Set the playing field</h2>
        <span>01 / League settings</span>
      </div>
      <p className="trade-help">
        All fields are required unless marked optional.
      </p>
      <div className="trade-fields">
        <label>
          League format
          <select
            value={settings.league}
            onChange={(event) =>
              onChange({
                league: event.target.value as LineupSettings["league"],
              })
            }
          >
            <option value="redraft">Redraft</option>
            <option value="keeper">Keeper</option>
            <option value="dynasty">Dynasty</option>
          </select>
        </label>
        <label>
          Scoring format
          <select
            value={settings.scoring}
            onChange={(event) =>
              onChange({
                scoring: event.target.value as LineupSettings["scoring"],
              })
            }
          >
            {scoringFormats.map((format) => (
              <option key={format} value={format}>
                {format === "PPR" ? "Full PPR" : format}
              </option>
            ))}
          </select>
        </label>
        <label>
          Number of teams
          <input
            required
            type="number"
            min={4}
            max={32}
            value={settings.teams || ""}
            onChange={(event) =>
              onChange({ teams: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Season
          <input
            required
            type="number"
            min={2000}
            max={currentNflSeason() + 5}
            value={settings.season || ""}
            onChange={(event) =>
              onChange({ season: Number(event.target.value) })
            }
          />
        </label>
        <label>
          Draft position (optional)
          <input
            type="number"
            min={1}
            max={settings.teams}
            placeholder="Unknown"
            value={settings.draftPosition ?? ""}
            onChange={(event) =>
              onChange({
                draftPosition:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          />
        </label>
      </div>
      <p className="trade-help">
        {settings.league === "redraft"
          ? "Your selected season comes first."
          : "Your selected season and long-term value both matter. Include keeper rules, team goals, and future picks below."}
      </p>
      <div className="trade-details">
        <h3>Starting roster requirements</h3>
        <p className="trade-help">
          Set unused slots to 0. FLEX: RB/WR/TE. SUPERFLEX: QB/RB/WR/TE. This
          player catalog supports offensive skill positions.
        </p>
        <div className="trade-fields trade-lineup-fields">
          {rosterSlots.map((slot) => (
            <label key={slot}>
              {slot}
              <input
                required
                aria-label={`${slot} starters`}
                type="number"
                min={0}
                max={6}
                value={settings.lineup[slot]}
                onChange={(event) =>
                  onChange({
                    lineup: {
                      ...settings.lineup,
                      [slot]: Number(event.target.value),
                    },
                  })
                }
              />
            </label>
          ))}
        </div>
      </div>
      <label className="lineup-notes">
        Additional context (optional)
        <textarea
          rows={4}
          maxLength={3000}
          placeholder="Team goals, keeper eligibility and costs, future draft picks…"
          value={settings.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
        />
        <small>
          {settings.notes.length.toLocaleString()} / 3,000 characters
        </small>
      </label>
    </section>
  );
}
