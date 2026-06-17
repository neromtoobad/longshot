// Real team crest from ESPN. Falls back to a small dot when no logo is available.

export function TeamLogo({ src, name, size = 22 }: { src: string | null; name: string; size?: number }) {
  if (!src) {
    return <span className="inline-block shrink-0 rounded-full bg-line2" style={{ width: size * 0.5, height: size * 0.5 }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={name}
      width={size}
      height={size}
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
}
