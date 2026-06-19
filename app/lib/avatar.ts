// Agent avatar images. Every agent gets a generated image keyed by a (style, seed) pair via the
// DiceBear API — no asset hosting. The build flow lets the user pick a style and shuffle the seed;
// the chosen pair is stored on the agent and rendered everywhere through <Avatar>.

export type AvatarStyle =
  | "bottts"
  | "bottts-neutral"
  | "pixel-art"
  | "thumbs"
  | "fun-emoji"
  | "shapes";

export const AVATAR_STYLES: { id: AvatarStyle; label: string }[] = [
  { id: "bottts", label: "Bots" },
  { id: "bottts-neutral", label: "Droids" },
  { id: "pixel-art", label: "8-bit" },
  { id: "thumbs", label: "Mascot" },
  { id: "fun-emoji", label: "Faces" },
  { id: "shapes", label: "Glyph" },
];

export const DEFAULT_AVATAR_STYLE: AvatarStyle = "bottts";

// Card-palette backgrounds so generated images sit on-brand wherever they render.
const BG = "225aeb,2a2833,4d7ef5,0b0a12";

export type AvatarSpec = { style?: string; seed?: string } | null | undefined;

/** Build a deterministic DiceBear SVG url for a (style, seed). */
export function avatarUrl(style: string | undefined, seed: string): string {
  const s = encodeURIComponent(seed || "agent");
  const st = style || DEFAULT_AVATAR_STYLE;
  return `https://api.dicebear.com/9.x/${st}/svg?seed=${s}&radius=18&backgroundColor=${BG}`;
}

/** A stable pool of fun seeds the picker shows as thumbnails. */
export const SEED_POOL = [
  "alpha", "bravo", "cosmo", "delta", "echo", "fox",
  "ghost", "halo", "ion", "jet", "krait", "lux",
  "nova", "onyx", "pulse", "quark", "rune", "saber",
];

/** Pick a random seed token (browser-only; used by the shuffle button). */
export function randomSeed(): string {
  return SEED_POOL[Math.floor(Math.random() * SEED_POOL.length)] + "-" + Math.floor(Math.random() * 1000);
}
