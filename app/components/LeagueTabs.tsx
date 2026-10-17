import Link from "next/link";
import { COMPETITIONS, type CompetitionKey } from "@longshot/shared";

/** League switcher: one tab per competition, linking to `${base}?league=key`. */
export function LeagueTabs({ active, base }: { active: CompetitionKey; base: string }) {
  return (
    <div className="-mx-1 mb-6 flex gap-2 overflow-x-auto px-1 pb-1">
      {COMPETITIONS.map((c) => {
        const on = c.key === active;
        return (
          <Link
            key={c.key}
            href={`${base}?league=${c.key}`}
            className={`flex shrink-0 items-center gap-2 rounded-xl border px-3.5 py-2 text-sm transition ${
              on ? "border-transparent font-semibold text-white" : "border-line bg-surface text-ink2 hover:border-line2 hover:text-ink"
            }`}
            style={on ? { background: `linear-gradient(180deg, ${c.color}, color-mix(in srgb, ${c.color} 70%, black))` } : undefined}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logo} alt="" className="h-5 w-5 rounded bg-white/90 object-contain p-px" />
            {c.name}
          </Link>
        );
      })}
    </div>
  );
}
