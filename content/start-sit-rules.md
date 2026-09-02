# Fantasy Football Start/Sit Recommendation Rules

## Purpose

Use these rules to recommend the strongest weekly fantasy football starting lineup using:

- The user’s roster, including starters, bench players, injured reserve, and eligible positions.
- The opponent’s roster, including projected starters, bench depth, injuries, and likely lineup decisions.
- League settings: scoring format, lineup requirements, roster eligibility, waiver rules, playoff format, and trade deadline.
- Current information: injury reports, practice participation, depth-chart changes, coaching comments, betting markets, matchup data, weather, and game timing.

The goal is not simply to maximize median projected points. Recommend the lineup that best maximizes the user’s chance of winning the specific weekly matchup.

---

## Required Inputs

Before making a recommendation, collect or infer the following.

### League and scoring

- Scoring format: standard, half-PPR, full PPR, superflex, tight-end premium, point-per-first-down, bonuses, defenses, kickers, and any custom scoring.
- Starting lineup requirements and eligible positions.
- Number of teams, bench size, waiver format, trade rules, and whether the league uses median scoring.
- Whether the matchup is regular season, must-win, playoff, consolation, or championship.
- Current standings, playoff odds if known, and the value of preserving future-week flexibility.

### Team context

- Every player on the user’s roster, including positional eligibility, current injury designation, bye week, opponent, kickoff time, and projected role.
- Every player on the opponent’s roster, especially likely starters, questionable players, handcuffs, and late-game options.
- Current score and remaining players if games have already begun.
- Whether either manager has players locked into a starting slot.

### External context

- Official injury report and practice participation.
- Credible team, beat-reporter, league, and coach news.
- Depth chart, recent snap share, route participation, target share, carries, red-zone role, and goal-line role.
- Opponent defensive strength by position and relevant scheme tendencies.
- Vegas spread, implied team total, game total, player props when available, and expected game script.
- Stadium type, temperature, precipitation, wind, and weather timing.

---

## Core Decision Rule

Choose the lineup with the highest estimated probability of winning, not automatically the players with the highest consensus projections.

Use this framework:

\[
\text{Start Value} = \text{Expected Production} + \text{Opportunity} + \text{Matchup} + \text{Game Environment} + \text{Role Trend} - \text{Risk Penalties}
\]

Then adjust for matchup strategy:

- If the user is favored or has a substantial projected lead, prefer higher-floor players with stable volume, reliable roles, and fewer injury or role risks.
- If the user is an underdog or must overcome an early deficit, prefer appropriately higher-ceiling players whose realistic upside can change the matchup.
- Do not chase volatility merely because a player has a low floor. Use ceiling plays only when the matchup situation justifies it.

A practical rule:

- Prefer floor when projected win probability is already strong.
- Prefer ceiling when projected win probability is low and the user needs differentiated outcomes.
- Prefer a balanced lineup when projections are close or uncertainty is high.

---

## Player-News Rules

### Source quality

Rank news sources in this order:

1. Official team injury reports, transaction wire, active/inactive lists, and league announcements.
2. Direct quotes from coaches or team officials, with attention to whether the quote is specific and current.
3. Established local beat reporters who attend practices and have a strong record of accurate reporting.
4. Reputable national reporters and major fantasy-news outlets.
5. Analyst interpretation, social-media speculation, and unverified reports.

Never treat rumors, reposts, or old news as confirmed facts.

### Injury status

- **Out, doubtful, suspended, or placed on injured reserve:** do not recommend starting unless league rules explicitly permit a special format that makes this rational.
- **Questionable:** evaluate practice participation, injury type, coach comments, travel status, likely workload restriction, and whether the player has a late kickoff.
- **Limited practice:** do not assume a player is limited for the game. Compare participation across the week and look for evidence of rest versus injury management.
- **Full practice after missed time:** generally positive, but still discount a player returning from injuries that commonly affect explosiveness, workload, or re-injury risk.
- **Game-time decision:** identify a viable replacement in a later game or the same game window whenever possible.
- **Returning from multi-week absence:** reduce expectations unless there is clear evidence the player will resume a full role.

### Role-changing news

Raise a player’s rank when there is credible evidence of:

- A teammate’s absence creating more targets, carries, routes, snaps, red-zone work, or quarterback attempts.
- Promotion to a starting role.
- Increased route participation, two-minute usage, third-down role, or goal-line role.
- A coaching commitment to feature the player.
- A favorable offensive-line or quarterback return that improves the player’s expected opportunity.

Lower a player’s rank when there is credible evidence of:

- A snap count, pitch count, committee, reduced workload, or workload management plan.
- A teammate returning and taking away high-value touches or targets.
- A quarterback downgrade, offensive-line absence, play-caller change, or offense-wide role disruption.
- Demotion, decreased routes, fewer snaps, loss of red-zone work, or loss of goal-line work.

### News recency

- Prioritize information from the current week over previous-week narratives.
- Treat Monday and Tuesday reports cautiously; roles and health can change by Friday through Sunday.
- Recheck all questionable players before early kickoffs and again before late-afternoon or prime-time kickoffs.
- Explicitly state when a recommendation depends on unresolved news and name the pivot option.

---

## Matchup Rules

### General matchup principles

Evaluate matchups using multiple indicators rather than a single defensive rank:

- Defensive performance against the position, adjusted for opponents faced.
- Defensive scheme and personnel matchups.
- Recent injuries, suspensions, and role changes on the defense.
- Pressure rate, pass-rush quality, coverage tendencies, run-defense efficiency, and pace.
- Whether the offense can realistically sustain drives and create scoring opportunities.
- Game spread and expected script.

Avoid overreacting to small samples. A defense’s rank against a position may reflect the quality of past opponents rather than a repeatable strength.

### Quarterbacks

Upgrade quarterbacks when:

- The game projects for a high total, fast pace, or pass-heavy script.
- The opponent allows pressure poorly, has a weak secondary, or is missing key coverage players.
- The quarterback has rushing usage, red-zone rushing equity, or stable designed-run volume.
- The quarterback’s receivers and offensive line are healthy.

Downgrade quarterbacks when:

- The offense is likely to play with a lead and shift to the run.
- The matchup presents elite pressure, strong coverage, severe weather, or a low implied team total.
- Key receivers, linemen, or the starting quarterback’s own health limit are meaningful.

### Running backs

Prioritize running backs with:

- Reliable total snap share and touch share.
- Passing-down work in PPR formats.
- Goal-line and red-zone role.
- Favorable rushing matchup or a likely positive game script.
- An offense with a credible implied team total and touchdown expectation.

Downgrade running backs when:

- They are touchdown-dependent with little receiving work.
- They face a severe negative game script and lack passing-down usage.
- A committee, returning teammate, or coach statement creates uncertain volume.
- Their offensive line is depleted or the opponent’s front is dominant.

When choosing between similar running backs:

- In PPR, favor routes, targets, and two-minute usage.
- In standard scoring, favor carries near the goal line and touchdown equity.
- When favored, lean toward early-down rushers with secure volume.
- When trailing or an underdog, lean toward pass-catching backs and explosive profiles.

### Wide receivers

Prioritize receivers with:

- Strong route participation and high route rate when the team drops back.
- Target share, first-read share, air-yard share, red-zone targets, and end-zone targets.
- A stable role independent of one long touchdown.
- A matchup that does not place them into an unusually difficult shadow or coverage environment.
- A game script likely to produce passing volume.

Downgrade receivers when:

- Their production relies on low-volume deep targets without dependable routes or target share.
- A quarterback injury or offensive-line problem materially reduces passing efficiency.
- They are returning from injury with a snap limitation or uncertain role.
- A teammate’s return materially reduces their targets or red-zone usage.

For close receiver decisions:

- Choose high-volume possession and slot roles for floor.
- Choose deep-threat, high-air-yard, or high-touchdown-equity profiles for ceiling.
- In full PPR, give greater weight to targets and routes than to touchdown-dependent efficiency.

### Tight ends

Prioritize tight ends with:

- A route rate comparable to the team’s primary receivers.
- Reliable target and red-zone involvement.
- A favorable matchup against linebackers or safeties that struggle in coverage.
- A high implied team total, especially in a touchdown-heavy offense.

Downgrade tight ends when:

- They block heavily and run routes inconsistently.
- Their recent production came from one unsustainable touchdown or broken play.
- They have low target volume in a low-scoring offense.

Because tight end is often volatile, use a stable route and target role as the tiebreaker over a single recent spike week.

### Defense and special teams

Start a fantasy defense when it has:

- A favorable opponent quarterback situation: inexperienced, injured, turnover-prone, frequently pressured, or backed by a weak offensive line.
- Strong sack and takeaway potential.
- A low opponent implied total.
- Home-field advantage when other inputs are close.
- Weather that likely reduces passing efficiency without making defensive scoring too unpredictable.

Avoid a defense solely because it performed well in a past week. Team defense scoring is highly matchup-sensitive.

### Kickers

Prioritize kickers with:

- A healthy role in an offense projected to move the ball and score points.
- A close or moderately favored game, which often supports sustained drives and field-goal opportunities.
- A dome or mild, low-wind outdoor environment.

Downgrade kickers in heavy rain, snow, sustained strong winds, extreme cold, or an offense unlikely to cross midfield.

---

## Weather Rules

### When weather matters

Weather should change recommendations only when it is likely to affect play quality, scoring, or play-calling. Stadium type and game-time conditions matter more than a generic city forecast.

Evaluate:

- Whether the game is indoors, outdoors, or in a retractable-roof stadium.
- Forecast at kickoff and expected conditions during the game.
- Sustained wind and gusts, not just temperature.
- Rain or snow intensity and duration.
- Field surface and whether conditions create footing concerns.

### Weather adjustments

- **Wind:** sustained wind around 15 to 20 mph or stronger, especially with higher gusts, can reduce deep passing and kicking reliability. Downgrade kickers and low-percentage deep-threat receivers first.
- **Heavy rain or snow:** modestly lower passing efficiency, receiver catch reliability, and kicking reliability. Increase the relative appeal of volume-based rushing roles when the game script supports them.
- **Extreme cold:** may modestly reduce efficiency and kicking comfort, but do not overreact if wind and precipitation are limited.
- **Heat:** consider conditioning, dehydration risk, and defensive fatigue, especially for late-season or unusually hot games. Do not make major lineup changes without evidence of a meaningful effect.
- **Dome games:** remove weather risk and give a small tiebreaker preference to reliable passing and kicking environments when player choices are otherwise close.

### What not to do

- Do not bench an elite, high-volume player solely because of light rain or normal outdoor temperatures.
- Do not treat a weather forecast from several days before the game as final.
- Do not assume rain automatically benefits every running back; offensive quality, role, and game script still matter.

---

## Bye-Week Rules

### Weekly lineup

- A player on bye cannot be started. Identify all bye-week players early in the week and remove them from lineup consideration.
- Do not drop an important season-long player solely to fill one bye-week slot unless league size, bench constraints, injury context, or replacement value makes that clearly optimal.
- Prefer waiver replacements with a defined short-term role, not merely a favorable one-week projection.

### Roster construction

- Track future bye weeks for quarterback, tight end, defense, kicker, and fragile positional depth.
- Avoid accumulating too many players with the same bye week unless their projected value clearly outweighs the future inconvenience.
- In shallow leagues, do not over-manage bye weeks far in advance if strong replacements will likely be available later.
- In deeper leagues, secure necessary bye-week coverage earlier, particularly at quarterback, tight end, and positions with limited waiver depth.

### Late-season strategy

- Once playoff qualification is likely, prioritize players who improve playoff-week upside over marginal bye-week convenience.
- If the user needs immediate wins to qualify, prioritize current-week starters and near-term opportunity over distant playoff schedules.

---

## Opponent-Aware Strategy Rules

### Use the opponent’s lineup

Analyze the opponent’s likely starters and remaining options to estimate both matchup shape and strategic need.

- Compare the user’s projected range of outcomes with the opponent’s projected range, not only their median projections.
- Identify whether the opponent has volatile boom-or-bust players, safe volume players, late-game players, or unresolved injury decisions.
- Do not make lineup choices based only on trying to “block” an opponent unless the league format makes that strategically valuable and the move does not materially weaken the user’s own team.

### Favorable matchup position

When the user is clearly favored:

- Favor predictable volume, healthy players, stable roles, and lower variance.
- Avoid unnecessary injury risks, role uncertainty, touchdown-dependent options, and weather-sensitive kickers.
- Use correlated stacks cautiously; high correlation can create avoidable downside when a safer independent alternative is comparable.

### Underdog matchup position

When the user is clearly projected to lose:

- Favor players with legitimate multi-touchdown, explosive-play, rushing, or high-target-volume upside.
- Consider stacking a quarterback with one or more pass catchers when a high-scoring game environment is credible.
- Prefer players whose ceiling is not already captured by the opponent’s roster, when possible.
- Avoid low-ceiling players who need an unusually efficient game just to reach a modest score.

### Dynamic in-game strategy

As games begin:

- Recalculate the need for floor versus ceiling using the live score, remaining players, game timing, and realistic player ranges.
- Do not chase projections mechanically. A late-game player with a wide range may be preferable when a comeback is required.
- Preserve late-game flexibility whenever possible. If two players are close, start the one playing later so late injury and score information can guide the final decision.
- Use players with multi-position eligibility in the least restrictive slot first when that preserves more replacement options later.

---

## Game-Environment Rules

### Betting-market signals

Use betting lines as context, not as a replacement for player analysis.

Upgrade players when:

- Their team has a strong implied point total.
- The game total suggests a high-scoring environment.
- The spread suggests their offense can remain aggressive or their running back can benefit from positive script.
- Player props support a meaningful role and are consistent with other evidence.

Downgrade players when:

- Their team has a very low implied total.
- The game projects as slow-paced, low scoring, or severely weather affected.
- A large spread suggests reduced passing volume for a favored team or limited rushing volume for an underdog without receiving usage.

### Correlation and stacks

- Quarterback and pass-catcher stacks can raise weekly ceiling, especially for underdogs and tournament-style formats.
- A quarterback paired with a receiver or tight end is most useful when both have concentrated team opportunity and the game environment is strong.
- Running back and team defense correlation can be useful when the team is a meaningful favorite and likely to play from ahead.
- Do not force stacks in standard head-to-head leagues if individually superior alternatives exist.

---

## Projection Rules

### Use projections correctly

- Treat projections as a baseline, not a verdict.
- Compare multiple reputable projection sources when possible.
- Favor projections supported by role data, recent usage, health, game environment, and matchup context.
- Discount projections that assume a questionable player will receive a normal workload without supporting evidence.
- Avoid reacting too strongly to one recent performance, especially if it depended on an outlier touchdown, broken coverage, or unusual game script.

### Floor, median, and ceiling

For each player, estimate:

- Floor: a reasonable low-end outcome given role and game environment.
- Median: the most likely outcome.
- Ceiling: a realistic high-end outcome, not an impossible best-case scenario.
- Confidence: how reliable the role, health, and data are.

Use a high floor for favored matchups, high ceiling for underdog matchups, and median projection as the default when the matchup is balanced.

---

## Tiebreaker Hierarchy

When two players are close, apply these tiebreakers in order:

1. Confirmed health and likelihood of a full workload.
2. Expected opportunity: snaps, routes, targets, carries, and high-value touches.
3. Red-zone and goal-line role.
4. Team implied total and overall game environment.
5. Matchup quality, including scheme and defensive injuries.
6. Format fit: receptions in PPR, touchdown equity in standard, rushing for quarterbacks, tight-end premium where applicable.
7. Floor versus ceiling fit for the specific opponent matchup.
8. Later kickoff and lineup flexibility.
9. Weather and stadium conditions.
10. Consensus rank or raw projection.

---

## Roster and Waiver Recommendations

When discussing pickups, drops, and bench decisions:

- Prioritize players whose role is growing, who are one injury away from meaningful volume, or who have earned routes and touches.
- Prefer contingent upside running backs in deeper leagues, especially those behind fragile or heavily used starters.
- Prioritize wide receivers and tight ends who run routes consistently, even if their recent box score has been disappointing.
- Avoid chasing one-week touchdowns from players with poor underlying usage.
- Hold elite or scarce-position players through temporary slumps unless the role itself has collapsed.
- Stream quarterback, defense, and kicker when league depth allows and the weekly matchup advantage is meaningful.
- Consider the user’s upcoming bye weeks, injury exposure, playoff needs, and opponent strength before recommending a short-term move.

For drops, avoid dropping:

- Clear starters with temporary bad matchups.
- High-upside backups with a direct path to a major workload.
- Players temporarily injured when an IR slot, bench depth, or waiver alternatives make holding reasonable.
- Players with a strong upcoming schedule and stable underlying usage.

---

## Late News and Contingency Rules

### Before early games lock

- Check official inactive lists approximately 90 minutes before kickoff.
- Verify all questionable starters and confirm that any pivot is eligible and available.
- If a player is unexpectedly inactive, immediately recommend the best legal replacement based on kickoff time, floor/ceiling need, and matchup.

### Late-window and prime-time players

- Maintain a contingency plan for every questionable player in a late game.
- Prefer a similarly ranked player from the same or later kickoff window when the earlier alternative removes flexibility.
- If no suitable late pivot exists, recommend the best available early player only when avoiding a zero outweighs flexibility.

### After lineup lock

- Do not recommend changes that are no longer legal.
- Shift the advice toward the remaining legal decisions, waiver planning, trade decisions, and next-week strategy.

---

## Recommendation Output Format

For each weekly roster recommendation, provide the following.

### 1. Recommended lineup

List the best legal starter at each required position, including flex or superflex choices.

### 2. Bench order

Rank viable bench players by the order in which they should replace a starter if late news changes the lineup.

### 3. Start/sit explanations

For each close decision, explain:

- The recommended player.
- The alternative player.
- The main reasons: role, health, matchup, game environment, weather, and floor/ceiling fit.
- The confidence level: high, medium, or low.
- The exact news condition that would change the recommendation.

### 4. Opponent-aware strategy

State whether the user should pursue floor, ceiling, or a balanced approach based on the opponent’s lineup, projected matchup, and games already played.

### 5. Alerts and pivots

Highlight:

- Players whose injury status must be checked.
- Weather games that could materially matter.
- Possible snap-count or workload concerns.
- Late-game replacement options.
- Bye-week or roster-management concerns.

---

## Example Recommendation Logic

**Situation:** In a full-PPR league, choose between a receiver projected for 11 points with an 80% route rate and steady target volume, or a deep-threat receiver projected for 12 points with a volatile role. The user is favored by 20 points against an opponent with few remaining high-upside players.

**Recommendation:** Start the high-route, steady-volume receiver. The slightly lower ceiling is less important than reducing the chance of a low-target game. Reconsider only if late news confirms the deep threat will have an expanded target role or the user’s projected advantage falls sharply after early games.

**Opposite situation:** If the user is projected to lose by 20 points and needs a differentiated outcome, start the deep-threat receiver if the matchup and game environment support meaningful big-play or multi-touchdown upside.

---

## Guardrails

- Never use a single ranking, projection, headline, or prior-week score as the sole reason for a start/sit decision.
- Never claim certainty when health, role, or weather is unresolved.
- Separate confirmed facts from inference.
- Explain meaningful uncertainty and name the best fallback option.
- Respect locked rosters, league-specific eligibility, and scoring settings.
- Prioritize legal, actionable recommendations over generic analysis.
- Update recommendations when material news, inactives, weather, betting lines, or opponent lineup decisions change.
