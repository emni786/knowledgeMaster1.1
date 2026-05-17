import { useMemo } from "react";

export interface Atom {
  label: string;
  value: number;
  electrons: string[];
}

/**
 * "3D" atoms visualization using pure SVG with rotating elliptical orbits.
 * Each atom = one nucleus (top domain/category) with electrons (sub items).
 * Pseudo-3D via tilted ellipse orbits + perspective scale.
 */
export function AtomGraph({ atoms }: { atoms: Atom[] }) {
  const items = useMemo(() => atoms.slice(0, 6), [atoms]);
  if (!items.length) {
    return (
      <div className="grid h-[420px] place-items-center rounded-2xl border border-dashed border-border/60 text-sm text-muted-foreground">
        No data yet — save a few links to see your knowledge atoms.
      </div>
    );
  }

  const cols = items.length <= 3 ? items.length : 3;
  return (
    <div
      className="grid gap-6 rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-primary/5 p-6"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((a, i) => (
        <Atom key={a.label} atom={a} idx={i} />
      ))}
    </div>
  );
}

function Atom({ atom, idx }: { atom: Atom; idx: number }) {
  const max = Math.max(atom.value, 1);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const nucleusR = 18 + Math.min(22, atom.value);
  const electrons = atom.electrons.slice(0, 5);

  // Orbit configs (rx, ry, rotateDeg)
  const orbits = [
    { rx: 70, ry: 26, rot: 0 },
    { rx: 86, ry: 32, rot: 60 },
    { rx: 100, ry: 38, rot: 120 },
  ];

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size, perspective: "600px" }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="overflow-visible"
        >
          <defs>
            <radialGradient id={`nucleus-${idx}`} cx="35%" cy="35%">
              <stop offset="0%" stopColor="hsl(var(--primary) / 0.95)" />
              <stop offset="60%" stopColor="hsl(var(--primary) / 0.55)" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.15)" />
            </radialGradient>
            <filter id={`glow-${idx}`}>
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Orbits */}
          {orbits.map((o, oi) => (
            <g
              key={oi}
              style={{ transformOrigin: `${cx}px ${cy}px`, transform: `rotate(${o.rot}deg)` }}
            >
              <ellipse
                cx={cx}
                cy={cy}
                rx={o.rx}
                ry={o.ry}
                fill="none"
                stroke="hsl(var(--primary) / 0.2)"
                strokeWidth="1"
                strokeDasharray="2 4"
              />
            </g>
          ))}

          {/* Electrons orbiting */}
          {electrons.map((label, ei) => {
            const o = orbits[ei % orbits.length];
            const dur = 6 + ei * 1.5;
            const delay = ei * -1.2;
            return (
              <g
                key={ei}
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  transform: `rotate(${o.rot}deg)`,
                  animation: `atom-spin ${dur}s linear ${delay}s infinite`,
                }}
              >
                <circle
                  cx={cx + o.rx}
                  cy={cy}
                  r="5"
                  fill="hsl(var(--primary))"
                  filter={`url(#glow-${idx})`}
                >
                  <title>{label}</title>
                </circle>
              </g>
            );
          })}

          {/* Nucleus */}
          <circle
            cx={cx}
            cy={cy}
            r={nucleusR}
            fill={`url(#nucleus-${idx})`}
            filter={`url(#glow-${idx})`}
          />
          <text
            x={cx}
            y={cy + 4}
            textAnchor="middle"
            className="fill-primary-foreground font-mono"
            style={{ fontSize: 11, fontWeight: 600 }}
          >
            {atom.value}
          </text>
        </svg>
      </div>
      <div className="mt-3 text-center">
        <div className="text-sm font-semibold truncate max-w-[180px]">{atom.label}</div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {atom.electrons.length} signals
        </div>
      </div>
      <style>{`
        @keyframes atom-spin {
          from { transform: rotate(${0}deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
