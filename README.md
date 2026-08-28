# Sleeper Draft Assistant

A live draft board for [Sleeper](https://sleeper.com) fantasy football leagues that asks Claude which player to take next — using **your** preference document, your league's exact scoring/roster settings, the live board, and a rankings/ADP sheet.

Built with Next.js (App Router) and deploys to Vercel with no database.

## How it works

```
Browser ── polls Sleeper every 5s ──▶ /api/sleeper/*  (read-only proxy → api.sleeper.app)
        ── once a day ──────────────▶ /api/players    (trimmed 1,000-player pool, CDN-cached 24h)
        ── on load ─────────────────▶ /api/rankings   (bundled rankings template, CDN-cached 24h)
        ── "Recommend" / auto ──────▶ /api/recommend  → Claude (claude-opus-5, structured JSON)
                                      reads content/preferences.md + your rankings
                                      (imported, else content/rankings-template.csv)
```

All the counting is done in code, not by the model: whose turn it is, how many picks until yours, which slots pick in between and what they need, your unfilled starter slots, bye-week pile-ups, tier drop-offs, and a **P(gone before your next pick)** estimate from ADP. Claude gets those facts plus your preferences and makes the judgment call. Output is validated against a schema, so the UI always shows a top pick, alternates, "won't survive to your next pick," "targets for the following pick," and warnings.

## Setup

1. **Install**
   ```bash
   npm install
   cp .env.example .env.local   # then put your Claude API key in ANTHROPIC_API_KEY
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
| `BYE` | recommended | **Not pre-filled** (Sleeper's API doesn't expose bye weeks). Without it, bye-week clash warnings won't fire. |
| `ADP` | recommended | Average draft position. Drives the "P(gone before your next pick)" estimate — the single most useful signal for deciding whether to wait on a player. |
| `PROJ` | optional | Projected season points. |

Every column except the name is optional; anything you leave blank is simply not used. Partial fills are fine — e.g. tiers and ADP for the top 100 only. To regenerate the template against an updated roster (post-cuts, post-trade):

```bash
npm run rankings-template
```

Common exports work as-is too: header names like `Player`, `Overall`, `ECR`, `AVG PICK`, `Bye Week`, `Pos Rank`, `FPTS` are all recognized, tab-separated files are accepted, and `RB1`-style position cells are split into position + positional rank. The import panel reports how many rows matched, so you can spot a bad export immediately.

During the draft the board refreshes every 5 seconds. By default a recommendation auto-runs whenever a pick lands and you're within 3 picks of your turn, so the answer is waiting when you're on the clock. The effort selector (fast / balanced / deep) trades depth for speed; "balanced" is a good choice on a 60-second clock.

Every answer is kept — failed runs included. **History** under the recommendation panel lists each past run (pick number, round, effort, the note you sent, and the pick that was actually made at that spot next to what Claude suggested); expanding one shows the full answer again, plus a **Raw** toggle with the exact JSON and token usage. **Download log** saves the whole draft as JSON. The log lives in your browser, is scoped to one draft, survives a reload, and is wiped by **Clear** in the panel or **Reset everything** in Settings.

## Deploy to Vercel

```bash
npx vercel
```
Set environment variables in the Vercel project:

| Variable | Required | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | yes | Server-side Claude key; never sent to the browser |
| `APP_PASSWORD` | recommended | If set, `/api/recommend` requires the same value entered in the app's Settings drawer — stops strangers from spending your key on a public URL |
| `ANTHROPIC_WORKSPACE_ID` | only for identity-linked keys | Workspace the request acts in, sent as the `anthropic-workspace-id` header. Without it such a key fails with `400 anthropic-workspace-id is required`. Find it in Console → Settings → Workspaces (the `wrkspc_…` id in the workspace URL) |
| `ANTHROPIC_MODEL` | no | Override the model (default `claude-opus-5`) |

`content/preferences.md` and `content/rankings-template.csv` deploy with the app — edit them, push, redeploy. Imported rankings and your Sleeper IDs live in your browser's localStorage.

Note: `/api/recommend` sets `maxDuration = 300`. On the Vercel Hobby plan functions are capped lower (60s at the time of writing); use "fast"/"balanced" effort there, or upgrade to Pro for "deep".

## Dry run before draft day

Create a mock draft on Sleeper, paste its URL into the setup page, pick your slot, and draft a few rounds. That exercises everything: polling, the on-the-clock banner and countdown, auto-recommend, and rankings matching. A completed draft ID from a previous season also works for a static check.

`npm run smoke` (with `npm run dev` running) exercises the draft-order math, roster-needs engine, and CSV matcher against live Sleeper data.

## Project layout

```
app/                 pages + route handlers (players, rankings, sleeper proxy, recommend)
components/          SetupForm, DraftBoard, AvailablePlayers, Recommendations, MyRoster, RankingsImport, SettingsDrawer
lib/sleeper.ts       Sleeper types, fetch helper, league-format derivation
lib/draftMath.ts     snake/linear/reversal order, picks-until-my-turn, pick clock
lib/rosterNeeds.ts   starters/flex/bench gaps, bye clashes
lib/rankings.ts      CSV parsing, name normalization, matching to Sleeper ids, merge
lib/defaultRankings.ts   reads content/rankings-template.csv as the fallback rankings
lib/availability.ts  P(gone) model, tier summary
lib/prompt.ts        system prompt (strategy + league + preferences) and draft-state message
lib/schema.ts        zod schemas for the request and Claude's structured output
content/preferences.md   your draft philosophy — edit this
proxy.ts             optional APP_PASSWORD gate
```
