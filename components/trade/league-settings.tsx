import { scoringFormats } from "@/lib/rankings";
import type { LeagueSettings as Settings, TradeData } from "@/lib/trade/types";

type Props = {
  settings: Settings;
  data: TradeData | null;
  onChange: (change: Partial<Settings>) => void;
};

export function LeagueSettings({ settings, data, onChange }: Props) {
  return (
    <section
      className="trade-panel trade-settings"
      aria-label="League settings"
    >
      <div className="trade-section-heading">
        <h2>Set the playing field</h2>
        <span>01 / League settings</span>
      </div>
      <div className="trade-fields">
        <label>
          League type
          <select
            value={settings.league}
            onChange={(event) =>
              onChange({ league: event.target.value as Settings["league"] })
            }
          >
            <option value="redraft">Standard Redraft</option>
            <option value="keeper">Keeper</option>
            <option value="dynasty">Dynasty</option>
          </select>
        </label>
        <label>
          Scoring format
          <select
            value={settings.scoring}
            onChange={(event) =>
              onChange({ scoring: event.target.value as Settings["scoring"] })
            }
          >
            {(data?.formats ?? scoringFormats).map((format) => (
              <option key={format}>{format}</option>
            ))}
          </select>
        </label>
        <label>
          League size
          <input
            type="number"
            min={4}
            max={32}
            value={settings.teams}
            onChange={(event) =>
              onChange({ teams: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <p className="trade-help">
        {settings.league === "redraft"
          ? "Rest-of-season production comes first. Future draft picks are disabled."
          : settings.league === "dynasty"
            ? "Long-term production, age, career outlook and future draft capital matter."
            : "Balance current production with future value under your keeper rules."}
      </p>
      {settings.league === "keeper" && (
        <div className="trade-keeper-settings">
          <div className="trade-fields">
            <label>
              Keeper limit
              <input
                type="number"
                min={0}
                max={30}
                value={settings.keeperLimit}
                onChange={(event) =>
                  onChange({ keeperLimit: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Keeper cost (% of future value)
              <input
                type="number"
                min={0}
                max={100}
                value={settings.keeperCost}
                onChange={(event) =>
                  onChange({ keeperCost: Number(event.target.value) })
                }
              />
            </label>
          </div>
          <p className="trade-help">
            A common cost assumption applies to every player. Individual
            salaries, round costs and keeper eligibility are not modeled.
          </p>
          <label className="trade-checkbox">
            <input
              type="checkbox"
              checked={settings.keeperPicks}
              onChange={(event) =>
                onChange({ keeperPicks: event.target.checked })
              }
            />
            Allow trading future draft picks
          </label>
        </div>
      )}
      <details className="trade-details">
        <summary>Starting lineup & scoring rules</summary>
        <p className="trade-help">
          Lineup slots set positional scarcity for all values and likely
          starters when rosters are provided. FLEX: RB/WR/TE. SUPERFLEX:
          QB/RB/WR/TE.
        </p>
        <div className="trade-fields trade-lineup-fields">
          {Object.entries(settings.lineup).map(([slot, count]) => (
            <label key={slot}>
              {slot}
              <input
                aria-label={`${slot} starters`}
                type="number"
                min={0}
                max={6}
                value={count}
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
        {data && (
          <dl className="trade-scoring-rules">
            {data.scoringRules.map((rule) => (
              <div key={rule.label}>
                <dt>{rule.label}</dt>
                <dd>{rule.rate} pts each</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
    </section>
  );
}
