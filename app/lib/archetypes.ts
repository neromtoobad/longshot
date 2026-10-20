// Builder strategy presets + the template they compile to. Shared by the builder and by
// My Agents, which matches an on-chain template hash back to the preset that produced it.

import { hashTemplate, type AgentTemplate } from "@longshot/shared";

export const SOURCES = ["form", "odds", "table", "h2h"] as const;
export const SOURCE_LABEL: Record<(typeof SOURCES)[number], string> = { form: "Form", odds: "Odds", table: "Table", h2h: "Head-to-head" };
export const SOURCE_HINT: Record<(typeof SOURCES)[number], string> = {
  form: "last five results, goals for and against",
  odds: "bookmaker 1X2 + over/under, vig removed",
  table: "league position, points per game",
  h2h: "recent meetings between the two",
};
// Agent wallets keep a little USDC back to pay their own Gateway deposit gas.
export const GAS_RESERVE = 50_000n;
export type Source = (typeof SOURCES)[number];
export type Risk = "low" | "medium" | "high";
export type SourceState = { on: boolean; wtp: string };
export type Form = {
  name: string;
  persona: string;
  prompt: string;
  risk: Risk;
  budget: string;
  broker: boolean;
  avatarStyle: string;
  avatarSeed: string;
  sources: Record<Source, SourceState>;
};

export const ARCHETYPES: { key: string; emoji: string; blurb: string; form: Form }[] = [
  {
    key: "Market Reader",
    emoji: "📈",
    blurb: "trusts the bookmakers",
    form: {
      name: "Market Reader", avatarStyle: "bottts-neutral", avatarSeed: "halo",
      persona: "A disciplined favourite-backer who trusts the market over any story.",
      prompt: "Predict the exact score. Treat the market's probabilities as the truth; only move off them with a strong reason from the table.",
      risk: "low", budget: "2", broker: false,
      sources: { form: { on: false, wtp: "0" }, odds: { on: true, wtp: "0.006" }, table: { on: true, wtp: "0.003" }, h2h: { on: false, wtp: "0" } },
    },
  },
  {
    key: "Form Sniper",
    emoji: "🎯",
    blurb: "recent form, dead cheap",
    form: {
      name: "Form Sniper", avatarStyle: "pixel-art", avatarSeed: "ion",
      persona: "A specialist who reads recent form only and refuses to overpay for noise.",
      prompt: "Predict the exact score from each side's last five matches. Ignore reputations and the market.",
      risk: "medium", budget: "1", broker: false,
      sources: { form: { on: true, wtp: "0.005" }, odds: { on: false, wtp: "0" }, table: { on: false, wtp: "0" }, h2h: { on: false, wtp: "0" } },
    },
  },
  {
    key: "Upset Hunter",
    emoji: "🎲",
    blurb: "backs the longshot",
    form: {
      name: "Upset Hunter", avatarStyle: "bottts", avatarSeed: "saber",
      persona: "A contrarian who hunts upsets when the cheap signals disagree with the favourite.",
      prompt: "Predict the exact score. When form and history contradict the table, back the underdog.",
      risk: "high", budget: "1", broker: true,
      sources: { form: { on: true, wtp: "0.004" }, odds: { on: false, wtp: "0" }, table: { on: true, wtp: "0.003" }, h2h: { on: true, wtp: "0.003" } },
    },
  },
  {
    key: "Data Maximalist",
    emoji: "🧠",
    blurb: "buys everything, every match",
    form: {
      name: "Data Maximalist", avatarStyle: "bottts-neutral", avatarSeed: "pulse",
      persona: "A data maximalist who buys every signal and weighs them all.",
      prompt: "Predict the exact score using every piece of evidence you bought. Be decisive.",
      risk: "high", budget: "3", broker: true,
      sources: { form: { on: true, wtp: "0.006" }, odds: { on: true, wtp: "0.006" }, table: { on: true, wtp: "0.004" }, h2h: { on: true, wtp: "0.004" } },
    },
  },
  {
    key: "Table Climber",
    emoji: "🪜",
    blurb: "the table never lies",
    form: {
      name: "Table Climber", avatarStyle: "thumbs", avatarSeed: "lux",
      persona: "A season-long thinker who trusts points per game over one-off results.",
      prompt: "Predict the exact score from the league table. The better side over the season usually wins.",
      risk: "low", budget: "0.5", broker: false,
      sources: { form: { on: false, wtp: "0" }, odds: { on: false, wtp: "0" }, table: { on: true, wtp: "0.003" }, h2h: { on: false, wtp: "0" } },
    },
  },
  {
    key: "Coinflip Kid",
    emoji: "🪙",
    blurb: "buys nothing, rides on gut",
    form: {
      name: "Coinflip Kid", avatarStyle: "fun-emoji", avatarSeed: "nova",
      persona: "A reckless gambler who buys no data and predicts on instinct, chasing infinite ROI.",
      prompt: "Predict the exact score from your prior alone. Be bold.",
      risk: "high", budget: "0", broker: false,
      sources: { form: { on: false, wtp: "0" }, odds: { on: false, wtp: "0" }, table: { on: false, wtp: "0" }, h2h: { on: false, wtp: "0" } },
    },
  },
];

export const ADJ = ["Neon", "Quantum", "Rogue", "Velvet", "Iron", "Solar", "Phantom", "Turbo", "Cosmic", "Feral", "Gilded", "Hyper", "Atomic", "Lunar", "Crimson", "Static"];
export const NOUN = ["Jackal", "Magpie", "Oracle", "Comet", "Bandit", "Sphinx", "Falcon", "Cobra", "Maverick", "Nomad", "Specter", "Vulcan", "Reaper", "Drake", "Hydra", "Vandal"];

export function toBaseUnits(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return String(Math.round(n * 1_000_000));
}
export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const usdcStr = (v: bigint) => (Number(v) / 1_000_000).toFixed(2).replace(/\.?0+$/, "") || "0";

/** The agent template a builder form compiles to (switched-off sources are kept as "0"). */
export function templateFromForm(f: Form): AgentTemplate {
  return {
    name: f.name,
    prompt: f.prompt,
    persona: f.persona,
    riskAppetite: f.risk,
    dataPreference: {
      preferBroker: f.broker,
      willingnessToPay: Object.fromEntries(SOURCES.map((s) => [s, f.sources[s].on ? toBaseUnits(f.sources[s].wtp) : "0"])),
    },
    modelProvider: "default",
    budget: toBaseUnits(f.budget),
  };
}

export const BUDGET_PRESETS = ["0", "0.5", "1", "2", "3"];

/** Find the preset (and budget preset) whose template hashes to an on-chain templateHash. */
export function matchPreset(templateHash: string, name?: string): AgentTemplate | null {
  for (const a of ARCHETYPES) {
    for (const budget of [a.form.budget, ...BUDGET_PRESETS]) {
      for (const nm of [a.form.name, name].filter(Boolean) as string[]) {
        const t = templateFromForm({ ...a.form, name: nm, budget });
        if (hashTemplate(t) === templateHash) return t;
      }
    }
  }
  return null;
}
