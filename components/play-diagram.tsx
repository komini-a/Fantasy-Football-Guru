export function PlayDiagram() {
  return (
    <div className="play-diagram" aria-hidden="true">
      <div className="diagram-heading">
        <span>THE GURU PLAYBOOK</span>
        <span>PLAY / 001</span>
      </div>
      <svg viewBox="0 0 480 360" fill="none">
        <defs>
          <marker
            id="route-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="5"
            refY="3"
            orient="auto"
          >
            <path d="m0 0 5 3-5 3" stroke="#ff925f" strokeWidth="1.5" />
          </marker>
        </defs>
        {[50, 120, 190, 260, 330, 400].map((x) => (
          <path
            key={x}
            d={`M${x} 20v320`}
            stroke="#d6e8d8"
            strokeOpacity=".12"
          />
        ))}
        {[60, 130, 200, 270].map((y) => (
          <g key={y}>
            <path d={`M18 ${y}h444`} stroke="#d6e8d8" strokeOpacity=".16" />
            <text
              x="22"
              y={y - 10}
              fill="#acc4ad"
              opacity=".5"
              fontSize="10"
              fontFamily="monospace"
            >
              {50 - (y - 60) / 7}
            </text>
          </g>
        ))}
        <path
          d="M28 258h424"
          stroke="#ff925f"
          strokeOpacity=".5"
          strokeDasharray="4 6"
        />
        <g stroke="#ff925f" strokeWidth="2.5" markerEnd="url(#route-arrow)">
          <path d="M83 247V148q0-17 17-17h52" />
          <path d="M385 247V102l-54-47" />
          <path d="M295 246v-56q0-16-16-16h-66" />
        </g>
        <path
          d="M240 290q-65 0-65-71V81"
          stroke="#b5c9a8"
          strokeWidth="2"
          strokeDasharray="6 6"
        />
        <g stroke="#dce8d6" strokeWidth="2.5">
          {[83, 185, 222, 259, 295, 385].map((x) => (
            <circle key={x} cx={x} cy="258" r="9" fill="#153e34" />
          ))}
          <circle cx="240" cy="299" r="10" fill="#153e34" />
        </g>
        <g stroke="#9db69b" strokeWidth="2" strokeLinecap="round">
          {[
            [85, 202],
            [180, 212],
            [225, 209],
            [270, 213],
            [385, 192],
            [305, 101],
          ].map(([x, y]) => (
            <path key={x} d={`m${x - 5} ${y - 5} 10 10m0-10-10 10`} />
          ))}
        </g>
      </svg>
      <div className="diagram-footer">
        <span>
          <i /> A little strategy. A real advantage.
        </span>
        <span>01 — 03</span>
      </div>
    </div>
  );
}
