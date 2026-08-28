import { parseRankings, mergeRankings } from "../lib/rankings";
import { turnInfo, slotForPick, picksForSlot } from "../lib/draftMath";
import { analyzeRoster } from "../lib/rosterNeeds";
import { slotCounts, type SleeperDraft, type SleeperPick, type Player } from "../lib/sleeper";

const { players } = (await (await fetch("http://localhost:3456/api/players")).json()) as { players: Player[] };
const draft = (await (await fetch("http://localhost:3456/api/sleeper/draft/257270643320426496")).json()) as SleeperDraft;
const picks = (await (await fetch("http://localhost:3456/api/sleeper/draft/257270643320426496/picks")).json()) as SleeperPick[];

// snake order sanity: 6 teams -> pick 7 is slot 6, pick 12 is slot 1, pick 13 is slot 1
console.log("slotForPick 1,6,7,12,13:", [1,6,7,12,13].map(p=>slotForPick(draft,p)));
console.log("picksForSlot(3):", picksForSlot(draft,3).slice(0,4));
const partial = picks.slice(0, 8);
const t = turnInfo({ ...draft, status: "drafting" }, partial, 3);
console.log("turn @ pick 9, slot 3:", { cur: t.currentPick, onClock: t.onTheClock, until: t.picksUntilMyTurn, next: t.myNextPicks, between: t.slotsBeforeMyTurn });
// verify against real picks: the actual slot for pick 9 should equal slotOnClock
console.log("real slot of pick 9:", picks[8].draft_slot, "computed:", t.slotOnClock);

const csv = `RK,TIERS,PLAYER NAME,TEAM,POS,BYE WEEK,ADP
1,1,"Bijan Robinson",ATL,RB1,5,1.4
2,1,"Ja'Marr Chase",CIN,WR1,10,2.1
3,1,"Saquon Barkley",PHI,RB2,9,3.5
4,2,"CeeDee Lamb",DAL,WR2,7,5.0
5,2,"Patrick Mahomes II",KC,QB1,10,30.2
6,3,"Baltimore Ravens",BAL,DST1,7,140
7,3,"Marvin Harrison Jr.",ARI,WR3,8,22
8,3,"Nobody Real",XXX,WR4,8,999`;
const r = parseRankings(csv, players);
console.log("rankings:", r.matched, "/", r.rows.length, "unmatched:", r.unmatched.map(u=>u.name), "cols:", r.columns);
console.log(r.rows.map(x=>`${x.name}->${x.playerId} ${x.pos}${x.posRank} adp${x.adp} tier${x.tier} bye${x.bye}`).join("\n"));
const merged = mergeRankings(players, r.rows, () => null);
console.log("merged top 8:", merged.slice(0,8).map(p=>`${p.name}(${p.pos}${p.posRank}) order=${p.order}`));
const slots = slotCounts(draft, null);
const roster = merged.filter(p=>["Bijan Robinson","Ja'Marr Chase","CeeDee Lamb","Saquon Barkley"].includes(p.name));
console.log(analyzeRoster(roster, slots, p=>(p as { bye?: number | null }).bye ?? null).summary);
