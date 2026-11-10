import type { LineupEvaluation } from "@/lib/lineup/types";

export function LineupResults({ result }: { result: LineupEvaluation }) {
  return (
    <section
      className="trade-panel lineup-results"
      aria-labelledby="lineup-results-heading"
    >
      <div className="trade-section-heading">
        <h2 id="lineup-results-heading">Your lineup rating</h2>
        <span>03 / AI evaluation</span>
      </div>
      <div className="lineup-grade">
        <strong aria-label={`Overall grade: ${result.grade}`}>
          {result.grade}
        </strong>
        <span>Overall grade</span>
      </div>
      <h3>Top three positional needs</h3>
      <ol className="lineup-needs">
        {result.positionsOfNeed.map((need) => (
          <li key={need.position}>
            <strong>{need.position}</strong>
            <p>{need.explanation}</p>
          </li>
        ))}
      </ol>
      <h3>Roster outlook</h3>
      <p className="lineup-summary">{result.summary}</p>
      <p className="trade-help">
        AI assessment based on your submitted roster and available application
        data. Edit your entries above to run a new evaluation.
      </p>
    </section>
  );
}
