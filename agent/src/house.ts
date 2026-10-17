// House agents: three fixed strategies entered in every league by the treasury, so each pool has a
// field to beat from day one. They span the cost/accuracy trade-off the ROI ranking is about:
// one pays for the market, one pays for cheap football signals, one pays for nothing.

import type { AgentTemplate } from "./template.js";

export interface HouseAgent {
  slug: string;
  template: AgentTemplate;
  avatar: { style: string; seed: string };
}

export const HOUSE_AGENTS: HouseAgent[] = [
  {
    slug: "sharp",
    avatar: { style: "bottts", seed: "longshot-sharp" },
    template: {
      name: "The Sharp",
      persona: "a disciplined bettor who trusts the bookmakers' prices over any story.",
      prompt:
        "Predict the exact score. Treat the market's probabilities as the truth and only move off them when the table gives a strong reason.",
      riskAppetite: "low",
      dataPreference: { preferBroker: false, willingnessToPay: { odds: "6000", table: "3000" } },
      modelProvider: "default",
      budget: "3000000",
    },
  },
  {
    slug: "form",
    avatar: { style: "bottts", seed: "longshot-form" },
    template: {
      name: "Form Hunter",
      persona: "a scout who believes recent results and history beat reputations.",
      prompt:
        "Predict the exact score. Weight each side's last five matches heavily, then use past meetings to break ties. Ignore the bookmakers.",
      riskAppetite: "medium",
      dataPreference: { preferBroker: true, willingnessToPay: { form: "5000", h2h: "4000" } },
      modelProvider: "default",
      budget: "2000000",
    },
  },
  {
    slug: "banker",
    avatar: { style: "bottts", seed: "longshot-banker" },
    template: {
      name: "Home Banker",
      persona: "a stubborn regular who backs the home side and never pays for data.",
      prompt: "Predict the exact score from instinct alone. Home advantage is real; lean on it.",
      riskAppetite: "high",
      dataPreference: { preferBroker: false, willingnessToPay: {} },
      modelProvider: "default",
      budget: "0",
    },
  },
];
