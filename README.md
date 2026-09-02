# Sleeper Draft Assistant

A draft board and in-season start/sit assistant for [Sleeper](https://sleeper.com) fantasy football leagues, powered by a model — Gemini by default, Claude optionally.

- **Draft day:** which player to take next, using **your** preference document, your league's exact scoring/roster settings, the live board, and a rankings/ADP sheet.
- **In season:** pick any week and any matchup, compare both rosters side by side, and get a start/sit recommendation governed by [`content/start-sit-rules.md`](content/start-sit-rules.md) and grounded in current injury, weather, and betting news pulled from a web search.
- **Waivers:** pick any team in the league and rank the unrostered players worth claiming for it, governed by [`content/waiver-rules.md`](content/waiver-rules.md) — with the ruleset's 100-point score, a FAAB range checked against that team's real remaining budget, and the drop it would cost.
- **Trades:** score a proposed trade for **both** sides, or generate offers a specific manager would plausibly accept, governed by [`content/trade-rules.md`](content/trade-rules.md). The before/after starting lineups are solved in code from your league's actual slots.

Built with Next.js (App Router) and deploys to Vercel with no database.

## How it works

```
Browser ── polls Sleeper every 5s ──▶ /api/sleeper/*  (read-only proxy → api.sleeper.app)
        ── once a day ──────────────▶ /api/players    (trimmed 1,000-player pool, CDN-cached 24h)
        ── on load ─────────────────▶ /api/rankings   (bundled rankings template, CDN-cached 24h)
        ── "Recommend" / auto ──────▶ /api/recommend  → Gemini or Claude (structured JSON)
                                      reads content/preferences.md + your rankings
                                      (imported, else content/rankings-template.csv)

        ── "Evaluate matchup" ──────▶ /api/matchup/recommend
                                      1. Gemini + Google Search → current injury,
                                         practice, weather and betting context (cited)
                                      2. Gemini or Claude → start/sit lineup,
                                         governed by content/start-sit-rules.md

        ── "Find pickups" ──────────▶ /api/waivers/recommend
                                      1. Gemini + Google Search → snap share, routes,
                                         target share, depth-chart moves (cited)
                                      2. Gemini or Claude → ranked claims,
                                         governed by content/waiver-rules.md

        ── "Evaluate trade" ────────▶ /api/trades/evaluate
                                      1. Gemini + Google Search → roles, injury
                                         timelines, rest-of-season outlook (cited)
                                      2. Gemini or Claude → per-team scorecard, or
                                         proposals, governed by content/trade-rules.md
```

All the counting is done in code, not by the model: whose turn it is, how many picks until yours, which slots pick in between and what they need, your unfilled starter slots, bye-week pile-ups, tier drop-offs, and a **P(gone before your next pick)** estimate from ADP. The model gets those facts plus your preferences and makes the judgment call. Output is validated against a schema, so the UI always shows a top pick, alternates, "won't survive to your next pick," "targets for the following pick," and warnings.

## Setup

1. **Install**
   ```bash
   npm install
   cp .env.example .env.local   # then put your Gemini API key in GEMINI_API_KEY
   npm run dev
   ```
2. **Write your preferences** in [`content/preferences.md`](content/preferences.md). Plain prose is fine; the template lists what matters most (strategy archetype, positional rules, risk tolerance, targets/avoids, stacking, league quirks). This file is the highest-authority input to every recommendation.
3. **Open the app**, enter your Sleeper username → pick your league → draft. Or paste any draft URL/ID (mock drafts work — choose your slot in the header).
4. **Import rankings** (Rankings button) — optional. [`content/rankings-template.csv`](content/rankings-template.csv) ships with the app and is used by default, so the board and every recommendation already have ranks, tiers, ADP and byes out of the box; the Rankings badge reads `template · 252`. **View template** in that panel shows exactly what the default contains — a filterable table of every row, the raw CSV behind a toggle, and **Load into editor** to start from it. Import your own CSV to replace it (the badge turns green), or **Clear** to fall back to the template again. Edit the template file and redeploy to change the default.

### Rankings CSV

[`content/rankings-template.csv`](content/rankings-template.csv) is pre-filled with the current 252-player pool (200 skill players in Sleeper's default order, then 20 kickers, then all 32 defenses) so you only have to fill in the numbers. It is also what the app uses by default — edit it and redeploy to change the defaults for everyone, or open it in Excel or Sheets, edit, save as CSV, and load it for this browser only with **Choose file** in the Rankings panel.

| Column | Fill in? | Notes |
|---|---|---|
| `RK` | **yes** | Your overall ranking. Pre-filled 1–252 as a starting point — reorder rows and renumber, or just edit values. This drives the board order. |
| `TIER` | recommended | Group players of similar value (1, 1, 1, 2, 2, …). Powers "last player in tier 3 — take him now" reasoning. Highest-value column after `RK`. |
| `PLAYER NAME` / `POS` / `TEAM` | pre-filled | From Sleeper. Leave alone — these are what rows get matched on. |
| `BYE` | pre-filled | Sleeper's API doesn't expose bye weeks, so the template carries them for the season it was generated. Regenerate or edit them for a new season, or bye-week clash warnings and start/sit bye exclusion will use last year's schedule. |
| `ADP` | recommended | Average draft position. Drives the "P(gone before your next pick)" estimate — the single most useful signal for deciding whether to wait on a player. |
| `PROJ` | optional | Projected season points. |

Every column except the name is optional; anything you leave blank is simply not used. Partial fills are fine — e.g. tiers and ADP for the top 100 only. To regenerate the template against an updated roster (post-cuts, post-trade):

```bash
npm run rankings-template
```

Common exports work as-is too: header names like `Player`, `Overall`, `ECR`, `AVG PICK`, `Bye Week`, `Pos Rank`, `FPTS` are all recognized, tab-separated files are accepted, and `RB1`-style position cells are split into position + positional rank. The import panel reports how many rows matched, so you can spot a bad export immediately.

During the draft the board refreshes every 5 seconds. By default a recommendation auto-runs whenever a pick lands and you're within 3 picks of your turn, so the answer is waiting when you're on the clock. The effort selector (fast / balanced / deep) trades depth for speed; "balanced" is a good choice on a 60-second clock.

Every answer is kept — failed runs included. **History** under the recommendation panel lists each past run (pick number, round, effort, the note you sent, and the pick that was actually made at that spot next to what the model suggested); expanding one shows the full answer again, plus a **Raw** toggle with the exact JSON and token usage. **Download log** saves the whole draft as JSON. The log lives in your browser, is scoped to one draft, survives a reload, and is wiped by **Clear** in the panel or **Reset everything** in Settings.

## In-season matchups

Once the season starts, open **Matchups** — from a league row on the setup page, or from the draft board header — to land on `/league/<leagueId>/matchups`.

Pick any week (1–18, defaulting to the current one, with playoff weeks marked) and any matchup in the league. Your own matchup is preselected when you own a team, co-owned teams included. Both rosters render side by side: starters in lineup-slot order, bench below, with injury designations, byes, IR/taxi status, and live points once the week is under way. Choose which side is yours, add an optional note, and press **Evaluate matchup**.

Evaluation only ever runs when you press the button — there is no polling and no auto-run, because each one makes two model calls.

What happens then:

1. **News lookup.** One Gemini call with Google Search grounding gathers the current injury designation, practice participation, role changes, weather, and betting lines for every startable player in the matchup, with source links. It applies the ruleset's own source hierarchy: official reports and team statements are marked confirmed, everything else is not. Results are cached for 15 minutes per matchup; **Refresh news** forces a new search.
2. **The recommendation.** [`content/start-sit-rules.md`](content/start-sit-rules.md) is the system prompt, so editing that file changes the advice with no code change. One exception worth knowing: the news lookup in step 1 has its own copy of the ruleset's source hierarchy in `RETRIEVAL_SYSTEM` (`lib/liveContext.ts`) — it runs before the ruleset is loaded, so if you change how sources are ranked, change it in both places. All the counting stays in code — which players are legally startable, which slots they're eligible for, who is on bye, IR, or the taxi squad, and whether the week has started. The model only makes judgment calls.

You get the recommended starter for every slot with its reasoning, the posture it chose (floor / ceiling / balanced) and why, every close call with a confidence level and **the exact news that would flip it**, the bench order for late changes, and alerts. Sources and the retrieval time are shown with the answer.

**If the news lookup can't run** — no `GEMINI_API_KEY`, or the search fails — you still get a recommendation, and the panel says plainly that it isn't grounded in current news. That is a real limitation, not a footnote: Sleeper's stored injury designations can be hours old, and the panel tells you how old.

Every evaluation is saved per league and week, failed runs included, so you can go back and see what was known before the week played out. Lineup problems the app catches in the model's answer (a player started twice, a slot left empty) are reported separately from the model's own alerts, so the record stays honest about which is which.

## Waivers

**Waivers** in the nav opens `/league/<leagueId>/waivers`. Pick a week and **any team in the league** — your own is preselected when you own one, but scouting another manager's needs is the point, so nothing stops you looking at theirs. That is a deliberate difference from the matchup view, which refuses to set a lineup for a roster you don't own.

The left panel is all computed in code: unfilled starter slots, open roster spots, FAAB remaining (or waiver priority, in a league that doesn't bid), bye-week pile-ups, and the roster itself. Press **Find pickups** and you get the ruleset's ranked claims — add type, the 100-point score with its breakdown, a suggested FAAB range, a confidence label, the named risk, and the drop it would cost.

**What the model is allowed to suggest is decided before it runs.** Free agents are derived (the player pool minus every roster in the league, IR and taxi included), then cut to a shortlist of ~60 by a deterministic rule: Sleeper's league-wide 24-hour add counts lead, then the rankings sheet, then Sleeper's own player order, with per-position caps widened for the positions this team actually needs. **What was considered** under the answer lists exactly that set, so "why wasn't X suggested" is always answerable. Anything the model returns that isn't on the list is dropped and reported.

Two boundaries the panel states rather than hides:

- The pool holds players on an NFL roster, so someone released in the last few days isn't in it at all.
- **Unrostered is not the same as claimable.** A player dropped in your league a day or two ago is still on waivers, and telling those apart needs Sleeper's transactions endpoint, which this doesn't use yet.

**An un-grounded waiver run is a weak run**, and the panel says so more bluntly than the matchup one does. The ruleset ranks on snap share, route participation, target share and depth-chart movement — Sleeper exposes none of it. Without the news lookup the model has stored injury designations, depth-chart order and add counts, and nothing else.

FAAB advice is checked against reality: a bid above what the team has left is capped and reported, and in a league on rolling priority the bid fields are cleared rather than invented.

## Trades

**Trades** opens `/league/<leagueId>/trades`, with two modes.

**Evaluate a trade** — pick two teams, tick the players moving each way, and get the ruleset's output: a verdict, a separate scorecard for *each* side, the asset-by-asset read, concrete ways to balance it, if/then contingencies, and a deliberately conservative fairness screen. A trade can score well for both teams at once, and it will say so.

**Find trades** — pick your team and either a specific partner or *Any team*, and get offers built from the other manager's problems rather than yours: what you send, what you get, the pitch, and why they'd rationally accept. **Evaluate this** on any proposal loads it into the evaluate form so it can be scored by the stricter path.

The comparison the ruleset is built on — *"the difference between the lineups each manager can start before and after"* — is arithmetic, so it happens in code. `bestLineup()` solves the best legal lineup for each side before and after the deal, using your league's real slots. It uses an augmenting-path assignment rather than filling dedicated slots first, because that shortcut is wrong in a league with both `REC_FLEX` (WR/TE) and `WRRB_FLEX` (RB/WR): with WR 10 / TE 9 / RB 8 the naive fill scores 18 where the optimum is 19. There's a unit test for exactly that case.

**One honest limitation, stated in the prompt and in the UI: this app has no rest-of-season projections.** The rankings sheet is a *preseason draft* sheet. So the lineup **shape** is reliable and the ordering behind it is a weak prior; where the grounded lookup returns a current rest-of-season outlook, that outranks both. With no news, the panel says plainly that you're getting a structural read of both rosters rather than a valuation.

A trade proposed after the league's deadline is flagged by the app, not left to the model to notice.

## What these features don't do

Sleeper's public API is read-only. Nothing here submits a waiver claim or sends a trade offer — you take the advice and act on it in Sleeper. Every run is user-triggered, and both features are logged per league so you can look back at what was suggested and whether it was grounded.

## Deploy to Vercel

```bash
npx vercel
```
Set environment variables in the Vercel project:

| Variable | Required | Purpose |
|---|---|---|
| `LLM_PROVIDER` | no | Which model evaluates the board: `gemini` (default) or `anthropic`. An unrecognized value is an error, not a silent fallback |
| `GEMINI_API_KEY` | when provider is `gemini`, **and for matchup news either way** | Server-side Gemini key; never sent to the browser. The matchup view's news lookup always uses Gemini (Search grounding has no Claude equivalent here), so an `LLM_PROVIDER=anthropic` deployment still needs this key for grounded start/sit advice — without it, recommendations run un-grounded and say so |
| `GEMINI_MODEL` | no | Override the model (default `gemini-pro-latest`). Effort is sent as a thinking level, so this expects a Gemini 3 or newer model |
| `APP_PASSWORD` | recommended | If set, `/api/recommend` requires the same value entered in the app's Settings drawer — stops strangers from spending your key on a public URL |
| `ANTHROPIC_API_KEY` | when provider is `anthropic` | Server-side Claude key; never sent to the browser |
| `ANTHROPIC_WORKSPACE_ID` | only for identity-linked Claude keys | Workspace the request acts in, sent as the `anthropic-workspace-id` header. Without it such a key fails with `400 anthropic-workspace-id is required`. Find it in Console → Settings → Workspaces (the `wrkspc_…` id in the workspace URL) |
| `ANTHROPIC_MODEL` | no | Override the model (default `claude-opus-5`) |

**Upgrading from a Claude-only deploy:** the provider now defaults to Gemini, so an environment that sets only `ANTHROPIC_API_KEY` will start returning "GEMINI_API_KEY is not set on the server." Either add a Gemini key or set `LLM_PROVIDER=anthropic` to keep the previous behavior.

`content/preferences.md` and `content/rankings-template.csv` deploy with the app — edit them, push, redeploy. Imported rankings and your Sleeper IDs live in your browser's localStorage.

Note: `/api/recommend` sets `maxDuration = 300`. On the Vercel Hobby plan functions are capped lower (60s at the time of writing); use "fast"/"balanced" effort there, or upgrade to Pro for "deep".

## Dry run before draft day

Create a mock draft on Sleeper, paste its URL into the setup page, pick your slot, and draft a few rounds. That exercises everything: polling, the on-the-clock banner and countdown, auto-recommend, and rankings matching. A completed draft ID from a previous season also works for a static check.

`npm test` runs the unit tests (Node's built-in runner via `tsx`, no dev server, no network): lineup slot eligibility, startability, matchup pairing, phase detection, response validation, the league-format derivation, optimal lineup assignment, free-agent derivation and shortlisting, league state (FAAB, roster space, waiver rules), the shape of each retrieval query, and two mechanical schema checks — that every schema stays inside the JSON Schema subset Gemini accepts, and that every array in the newer ones is bounded so an answer can't run past the output budget mid-JSON.

Note that `npm run lint` will not catch a bad `PageProps<"/some/route">` — those types are generated from the filesystem, so a mistyped route path only fails under `npm run build`.

`npm run smoke` (with `npm run dev` running) is the complement — it exercises the draft-order math, roster-needs engine, and CSV matcher against live Sleeper data.

## Project layout

```
app/                 pages + route handlers (players, rankings, sleeper proxy, recommend,
                     matchup/recommend, waivers/recommend, trades/evaluate,
                     league/[leagueId]/{matchups,waivers,trades})
components/          SetupForm, DraftBoard, AvailablePlayers, Recommendations, MyRoster,
                     RankingsImport, SettingsDrawer, MatchupBoard, MatchupCompare,
                     MatchupRecommendationPanel, WaiverBoard, WaiverRecommendationPanel,
                     TradeBoard, TradeEvaluationPanel, AppNav, Grounding, RawJson
lib/sleeper.ts       Sleeper types, fetch helper, league/scoring-format derivation
lib/draftMath.ts     snake/linear/reversal order, picks-until-my-turn, pick clock
lib/rosterNeeds.ts   starters/flex/bench gaps, bye clashes
lib/rankings.ts      CSV parsing, name normalization, matching to Sleeper ids, merge
lib/defaultRankings.ts   reads content/rankings-template.csv as the fallback rankings
lib/availability.ts  P(gone) model, tier summary
lib/playerPool.ts    shared server-side player pool (6h warm cache) + its age
lib/lineup.ts        starting slots, eligibility, startability, pairing, lineup validation,
                     bestLineup() — the optimal legal lineup, for trade before/after
lib/leagueState.ts   the whole league at once: every team's needs, FAAB, roster space
lib/freeAgents.ts    who is unrostered, and the deterministic shortlist sent to the model
lib/liveContext.ts   grounded Gemini news lookup — the only non-Sleeper data source
lib/prompt.ts        draft system prompt (strategy + league + preferences) and board state
lib/matchupPrompt.ts start/sit system prompt (ruleset + league) and matchup state
lib/waiverPrompt.ts  waiver system prompt (ruleset + league) and candidate state
lib/tradePrompt.ts   trade system prompt (ruleset + league), both evaluate and propose
lib/promptShared.ts  the league-format block every prompt needs
lib/schema.ts        zod schemas for every request and every structured output
lib/llm/             provider abstraction: gemini.ts, anthropic.ts, chosen by LLM_PROVIDER
content/preferences.md      your draft philosophy — edit this (draft only)
content/start-sit-rules.md  the weekly start/sit ruleset — edit this (in-season only)
content/waiver-rules.md     the waiver-wire ruleset — edit this
content/trade-rules.md      the trade-evaluation ruleset — edit this
proxy.ts             optional APP_PASSWORD gate on every model-calling route
```
