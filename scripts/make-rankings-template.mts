/**
 * Regenerates content/rankings-template.csv from the live Sleeper player pool.
 *
 *   npm run rankings-template
 *
 * Produces a CSV pre-filled with player name / position / team (facts from Sleeper)
 * and a starting RK order from Sleeper's own player ordering. TIER, BYE, ADP and PROJ
 * are left blank for you to fill in from whatever source you trust.
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { trimPlayers } from "../lib/players";
import type { Player } from "../lib/sleeper";

const SKILL_COUNT = 200; // QB/RB/WR/TE — covers a 12x16 draft with margin
const K_COUNT = 20;

const raw = await (await fetch("https://api.sleeper.app/v1/players/nfl")).json();
const all = trimPlayers(raw); // already sorted by Sleeper's search_rank

const ranked = all.filter((p) => p.srank != null);
const skill = ranked.filter((p) => ["QB", "RB", "WR", "TE"].includes(p.pos)).slice(0, SKILL_COUNT);
const kickers = ranked.filter((p) => p.pos === "K").slice(0, K_COUNT);
const defenses = all.filter((p) => p.pos === "DEF").sort((a, b) => a.name.localeCompare(b.name));

// Kickers and defenses go last: that's where they belong on a draft board.
const rows: Player[] = [...skill, ...kickers, ...defenses];

const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const header = "RK,TIER,PLAYER NAME,POS,TEAM,BYE,ADP,PROJ";
const body = rows.map((p, i) => [i + 1, "", esc(p.name), p.pos, p.team, "", "", ""].join(","));

const out = path.join(process.cwd(), "content", "rankings-template.csv");
await writeFile(out, [header, ...body].join("\n") + "\n", "utf8");
console.log(`Wrote ${rows.length} rows to ${out}`);
console.log(`  ${skill.length} skill players, ${kickers.length} kickers, ${defenses.length} defenses`);
