// Deterministic gradient avatar (no image assets) — a rounded-square tile with the agent's initial,
// colored by a hash of its name. Matches the dripit avatar tiles.

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const h = hash(name || "?");
  const a = h % 360;
  const b = (a + 48) % 360;
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-semibold text-[#0a0e1a]"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        background: `linear-gradient(135deg, hsl(${a} 75% 68%), hsl(${b} 70% 56%))`,
      }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </div>
  );
}
