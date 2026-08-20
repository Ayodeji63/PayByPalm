/**
 * Spending chart.
 *
 * Drawn from real transactions, not a decorative squiggle. If there is no data
 * the caller shows an empty state instead — a chart of nothing that still looks
 * like a chart is a lie about how much the app knows.
 */

import { formatNaira } from '../lib/money.js';

export interface ChartPoint {
  label: string;
  valueMinor: number;
}

const WIDTH = 320;
const HEIGHT = 120;
const PAD_Y = 14;
/** Keeps the first and last points, their highlight bar, and the value callout
 *  clear of the card edge — without it the newest month is clipped. */
const PAD_X = 20;

/**
 * Catmull-Rom through the points, converted to cubic beziers. A polyline reads
 * as jagged noise at this size; smoothing makes the shape legible without
 * moving any actual value.
 */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  const first = points[0]!;
  if (points.length < 3) {
    return points.map((p, i) => (i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`)).join(' ');
  }

  let d = `M${first.x},${first.y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function Chart({
  points,
  highlightIndex,
  onSelect,
}: {
  points: ChartPoint[];
  highlightIndex: number;
  onSelect: (index: number) => void;
}) {
  const values = points.map((p) => p.valueMinor);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;

  const usable = WIDTH - PAD_X * 2;
  const coords = points.map((p, i) => ({
    x: points.length === 1 ? WIDTH / 2 : PAD_X + (i / (points.length - 1)) * usable,
    y: HEIGHT - PAD_Y - ((p.valueMinor - min) / span) * (HEIGHT - PAD_Y * 2),
  }));

  const line = smoothPath(coords);
  const area = `${line} L${coords[coords.length - 1]?.x ?? 0},${HEIGHT} L${coords[0]?.x ?? 0},${HEIGHT} Z`;

  const active = coords[highlightIndex];
  const activePoint = points[highlightIndex];

  return (
    <div className="relative">
      {/* Callout for the selected month, as in the reference. */}
      {active && activePoint && (
        <div
          className="pointer-events-none absolute -top-1 z-10 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-white"
          style={{ left: `${Math.min(88, Math.max(12, (active.x / WIDTH) * 100))}%` }}
        >
          {formatNaira(activePoint.valueMinor)}
        </div>
      )}

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-7 h-32 w-full overflow-visible"
        role="img"
        aria-label={`Spending by month. ${points
          .map((p) => `${p.label}: ${formatNaira(p.valueMinor)}`)
          .join('. ')}`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Vertical marker behind the line for the selected month. */}
        {active && (
          <rect
            x={active.x - 13}
            y={0}
            width={26}
            height={HEIGHT}
            rx={13}
            fill="var(--color-accent)"
            opacity="0.1"
          />
        )}

        <path d={area} fill="url(#chart-fill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {active && (
          <circle cx={active.x} cy={active.y} r="5" fill="white" stroke="var(--color-accent)" strokeWidth="3" />
        )}
      </svg>

      {/* Month labels double as the control for choosing one. */}
      <div className="mt-2 flex justify-between">
        {points.map((point, index) => (
          <button
            key={point.label}
            type="button"
            onClick={() => onSelect(index)}
            aria-pressed={index === highlightIndex}
            className={`flex-1 py-1 text-[11px] font-medium transition-colors ${
              index === highlightIndex ? 'text-accent' : 'text-ink-faint'
            }`}
          >
            {point.label}
          </button>
        ))}
      </div>
    </div>
  );
}
