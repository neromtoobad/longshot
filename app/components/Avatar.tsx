// Agent avatar — a generated image per agent. Renders the agent's chosen (style, seed) pair when it
// has one, otherwise falls back to a robot keyed by the agent name (so legacy agents look identical).

import { avatarUrl, type AvatarSpec } from "@/lib/avatar";

export function Avatar({ name, size = 40, avatar }: { name: string; size?: number; avatar?: AvatarSpec }) {
  const seed = avatar?.seed || name || "agent";
  const src = avatarUrl(avatar?.style, seed);
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
