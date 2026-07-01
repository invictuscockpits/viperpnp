export interface Placement {
  id: string;
  part: string | null;
  side: string | null;
  x: number;
  y: number;
  rot: number;
}

/**
 * Renders board placements as a 2D map. KiCad Y is negative (origin top-left,
 * Y grows downward in file terms), so we plot at (x, -y) to get a board-like
 * view with Y up, and let the SVG viewBox work in millimetre space.
 */
export function BoardMap({ placements }: { placements: Placement[] }) {
  if (placements.length === 0) {
    return <div className="muted">no placements</div>;
  }

  const pts = placements.map((p) => ({ ...p, sy: -p.y }));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.sy);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const pad = 6;
  const w = maxX - minX + pad * 2;
  const h = maxY - minY + pad * 2;
  const viewBox = `${minX - pad} ${minY - pad} ${w} ${h}`;
  const r = Math.max(0.6, Math.min(w, h) / 110);

  return (
    <svg className="boardmap" viewBox={viewBox} preserveAspectRatio="xMidYMid meet">
      <rect
        x={minX - pad}
        y={minY - pad}
        width={w}
        height={h}
        fill="#0b0e12"
        stroke="#2a323d"
        strokeWidth={0.3}
      />
      {pts.map((p) => (
        <circle
          key={p.id}
          cx={p.x}
          cy={p.sy}
          r={r}
          fill={p.side === "Bottom" ? "#6db3ff" : "#05aa3d"}
          stroke="#0b0e12"
          strokeWidth={r * 0.18}
        >
          <title>{`${p.id} · ${p.part ?? "?"} · ${p.rot}°`}</title>
        </circle>
      ))}
    </svg>
  );
}
