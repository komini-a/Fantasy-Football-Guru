import {
  positions,
  scoringFormats,
  type PositionFilter,
  type ScoringFormat,
} from "@/lib/rankings";

type Props = {
  seasons: number[];
  season: number | null;
  seasonPlaceholder: string;
  scoring: ScoringFormat;
  formats: ScoringFormat[];
  position: PositionFilter;
  onSeason: (season: number) => void;
  onScoring: (scoring: ScoringFormat) => void;
  onPosition: (position: PositionFilter) => void;
};

export function RankingFilters({
  seasons,
  season,
  seasonPlaceholder,
  scoring,
  formats,
  position,
  onSeason,
  onScoring,
  onPosition,
}: Props) {
  return (
    <div className="ranking-filters">
      <div className="ranking-selectors">
        <label className="ranking-select">
          <span>Season</span>
          <select
            aria-label="Season"
            value={season ?? ""}
            disabled={!seasons.length}
            onChange={(event) => onSeason(Number(event.target.value))}
          >
            {!seasons.length && <option value="">{seasonPlaceholder}</option>}
            {seasons.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </label>
        <label className="ranking-select">
          <span>Scoring</span>
          <select
            aria-label="Scoring format"
            value={scoring}
            onChange={(event) => onScoring(event.target.value as ScoringFormat)}
          >
            {(formats.length ? formats : scoringFormats).map((format) => (
              <option key={format}>{format}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="position-filters" role="group" aria-label="Position">
        {positions.map((filter) => (
          <button
            key={filter}
            type="button"
            className="filter-pill"
            aria-pressed={position === filter}
            onClick={() => onPosition(filter)}
          >
            {filter}
          </button>
        ))}
      </div>
    </div>
  );
}
