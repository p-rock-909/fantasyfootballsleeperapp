"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSettings } from "@/lib/storage";

/**
 * The one navigation menu, on every page.
 *
 * Draft and Matchups need an id, which normally comes from the last league/draft opened
 * (localStorage). A page that knows better — the draft board knows its own `league_id`,
 * which can differ from whatever was stored last — passes it in. With no id at all the
 * item is shown disabled with the reason, rather than hidden: a missing menu entry reads
 * as a missing feature.
 */
export default function AppNav({ draftId, leagueId }: { draftId?: string | null; leagueId?: string | null }) {
  const [settings] = useSettings();
  const pathname = usePathname();

  const draft = draftId ?? settings?.draftId ?? null;
  const league = leagueId ?? settings?.leagueId ?? null;

  // Match on the trailing segment, not on `/league`: three pages now live under it, and a
  // prefix test would light up every one of them at once.
  const leaguePage = (name: string) => pathname.startsWith("/league") && pathname.endsWith(`/${name}`);
  const NO_LEAGUE = "Choose a league on Setup first";

  const items = [
    { key: "setup", label: "Setup", href: "/", active: pathname === "/", disabledReason: null },
    {
      key: "draft",
      label: "Draft",
      href: draft ? `/draft/${draft}` : null,
      active: pathname.startsWith("/draft"),
      disabledReason: "Open a draft from Setup first",
    },
    {
      key: "matchups",
      label: "Matchups",
      href: league ? `/league/${league}/matchups` : null,
      active: leaguePage("matchups"),
      disabledReason: NO_LEAGUE,
    },
    {
      key: "waivers",
      label: "Waivers",
      href: league ? `/league/${league}/waivers` : null,
      active: leaguePage("waivers"),
      disabledReason: NO_LEAGUE,
    },
    {
      key: "trades",
      label: "Trades",
      href: league ? `/league/${league}/trades` : null,
      active: leaguePage("trades"),
      disabledReason: NO_LEAGUE,
    },
  ];

  return (
    <nav aria-label="Main" className="flex shrink-0 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 p-0.5">
      {items.map((item) =>
        item.href ? (
          <Link
            key={item.key}
            href={item.href}
            aria-current={item.active ? "page" : undefined}
            className={`rounded px-2.5 py-1 text-sm transition ${
              item.active ? "bg-zinc-800 font-medium text-zinc-100" : "text-zinc-400 hover:text-zinc-100"
            }`}
          >
            {item.label}
          </Link>
        ) : (
          <span
            key={item.key}
            title={item.disabledReason ?? undefined}
            aria-disabled="true"
            className="cursor-not-allowed rounded px-2.5 py-1 text-sm text-zinc-600"
          >
            {item.label}
          </span>
        ),
      )}
    </nav>
  );
}
