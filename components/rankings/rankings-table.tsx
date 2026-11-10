import { formatPoints, type RankedPlayer } from "@/lib/rankings";

export function RankingsTable({
  players,
  selectedId,
  onSelect,
}: {
  players: RankedPlayer[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="rankings-table-scroll"
      role="region"
      aria-label="Player rankings table"
      tabIndex={0}
    >
      <table className="rankings-table">
        <caption className="visually-hidden">
          Players ranked by total fantasy points. Select a player to see season
          statistics.
        </caption>
        <thead>
          <tr>
            <th scope="col">Rank</th>
            <th scope="col">Player</th>
            <th scope="col">Position</th>
            <th scope="col">NFL team</th>
            <th scope="col" className="numeric">
              Games played
            </th>
            <th scope="col" className="numeric" aria-sort="descending">
              Total points
            </th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => (
            <tr
              key={player.id}
              className={player.id === selectedId ? "selected-row" : undefined}
              onClick={() => onSelect(player.id)}
            >
              <td className="rank-number">{player.rank}</td>
              <th scope="row">
                <button
                  type="button"
                  className="player-name"
                  aria-expanded={player.id === selectedId}
                  aria-controls={
                    player.id === selectedId ? "player-details" : undefined
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(player.id);
                  }}
                >
                  {player.name}
                </button>
              </th>
              <td>
                <span className="position-label">{player.position}</span>
              </td>
              <td>{player.team}</td>
              <td className="numeric">{player.gamesPlayed}</td>
              <td className="numeric total-points">
                {formatPoints(player.totalPoints)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
