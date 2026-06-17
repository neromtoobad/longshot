// Evidence payloads. PLACEHOLDER data until Phase 5 wires real ESPN fixtures + results.
// The shape is fixture-linked so routes don't change when real data lands. Values vary
// deterministically by fixtureId so the same fixture returns stable evidence.

export interface EvidenceMeta {
  fixtureId: string;
  source: "form" | "odds" | "injuries" | "h2h";
  placeholder: true;
  generatedAt: string;
}

function seed(fixtureId: string): number {
  let h = 0;
  for (let i = 0; i < fixtureId.length; i++) h = (h * 31 + fixtureId.charCodeAt(i)) >>> 0;
  return h;
}

function meta(fixtureId: string, source: EvidenceMeta["source"]): EvidenceMeta {
  return { fixtureId, source, placeholder: true, generatedAt: new Date().toISOString() };
}

export function formEvidence(fixtureId: string) {
  const s = seed(fixtureId);
  const f = (n: number) => ["W", "D", "L"][(s >> n) % 3];
  return {
    ...meta(fixtureId, "form"),
    home: { last5: [f(0), f(2), f(4), f(6), f(8)], goalsFor: 6 + (s % 7), goalsAgainst: 3 + (s % 5) },
    away: { last5: [f(1), f(3), f(5), f(7), f(9)], goalsFor: 5 + (s % 6), goalsAgainst: 4 + (s % 4) },
  };
}

export function oddsEvidence(fixtureId: string) {
  const s = seed(fixtureId);
  const home = 0.3 + (s % 35) / 100;
  const draw = 0.25 + (s % 15) / 100;
  const away = Math.max(0.05, 1 - home - draw);
  const norm = home + draw + away;
  return {
    ...meta(fixtureId, "odds"),
    impliedProbabilities: {
      home: +(home / norm).toFixed(3),
      draw: +(draw / norm).toFixed(3),
      away: +(away / norm).toFixed(3),
    },
  };
}

export function injuriesEvidence(fixtureId: string) {
  const s = seed(fixtureId);
  return {
    ...meta(fixtureId, "injuries"),
    home: { out: s % 4, doubtful: (s >> 2) % 3 },
    away: { out: (s >> 3) % 4, doubtful: (s >> 5) % 3 },
  };
}

export function h2hEvidence(fixtureId: string) {
  const s = seed(fixtureId);
  return {
    ...meta(fixtureId, "h2h"),
    meetings: 5 + (s % 6),
    homeWins: s % 5,
    draws: (s >> 2) % 4,
    awayWins: (s >> 4) % 5,
  };
}
