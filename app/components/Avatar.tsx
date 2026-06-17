// Robot-head agent avatars (DiceBear "bottts") — a unique cool robot per agent, deterministic from
// its name. No hosting needed; the API returns an SVG keyed by the seed.

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const seed = encodeURIComponent(name || "agent");
  const src = `https://api.dicebear.com/9.x/bottts/svg?seed=${seed}&radius=18&backgroundColor=225aeb,2a2833,4d7ef5`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 rounded-xl border border-line2 bg-surface2"
      style={{ width: size, height: size }}
    />
  );
}
