# User testing feedback

Below are user testing feedback remarks. **All items below are resolved** — see the resolution
note under each. (Round 1, addressed in commits `1ee24c8` and `63a3fce`.)

---

UF1: On the players' leaderboard, which it would be nice to have the out teams at the bottom of the list, so teams that are alive get filtered to the top for each player.

> ✅ **Resolved** (`63a3fce`). Each player's team list now sorts champion → alive → upcoming →
> eliminated → did-not-qualify, with deeper tournament runs first within a tier. Applied on the
> Players leaderboard and the player detail screen. Logic lives in `web/src/lib/stages.ts`
> (`sortPlayerTeams`).

UF2: In the bracket tab now, we have implemented the crossing out of players that are out. This is persistent throughout stages of the tournament: it would be good to see that when you click on Round of 32, all the players that were in at that point were uncrossed out. Then the players that are knocked out get crossed out at any given stage. So you would expect to see two players only in the final, but you might see four in the semi-finals, for example.

> ✅ **Resolved** (`63a3fce`). The bracket player filter is now per-selected-stage. A player is
> "in" (uncrossed) at a stage if any of their teams reached it (`furthestStage >= stage`).
> Verified: at the Final only the 2 finalists' owners show; at the Semifinals, 4 players show.
> Players are also sorted by how many teams they have left at the selected stage.

UF3: like what happens with the bracket, it would be good on the schedule tab to open up to the point that we are in. Let's say the date is the 21st of June. I would expect to see that at the top of the screen, and it'd be filtered down automatically to that point. Also, it may be helpful to have the games and days that are in the past be slightly duller in color, just to make it obvious to the user where we are against the schedule.

> ✅ **Resolved** (`63a3fce`). The Schedule tab auto-scrolls to the current day (the first day
> with an unplayed match) on load, tagged with a green "now" badge. Past days are dimmed and
> their matches show final scores. "Current" is derived from match results (not the wall clock),
> so it works for both the live tournament and the demo scenarios. Now also shows real team
> names + scores (previously just "Group A").

UF4: Issues in npm to group-stage, see results in the group groups standing tables. However, in the player leaderboards, everything is showing as upcoming and no points have been awarded. I can see the GD. In the brackets page, it looks like all players are crossed out, even though at the group stage everyone is still in.

> ✅ **Resolved** (`1ee24c8`). The engine was only marking teams alive/eliminated once a group
> was *fully* decided (all 6 matches). Now a team is `alive` as soon as it has played ≥1 group
> match. Verified: the group-stage scenario shows all 6 players with `alive=8`, ranked by GD.
> (Points stay 0 during the group stage — that's correct: the scoring rule awards points only
> from the Round of 32 onward.)

UP5: When launching the npm server we get an error: Emitted 'error' event on Server instance at:
[api] at emitErrorNT (node:net:1973:8)
[api] at process.processTicksAndRejections (node:internal/process/task_queues:90:21)

> ✅ **Resolved** (`1ee24c8`). This was an unhandled `EADDRINUSE` (port 8787 already in use by a
> stale server). `app.listen()` now has an `error` handler that prints a clear message
> ("Port 8787 is already in use…") and exits cleanly. If it recurs, a stale dev server is
> running — stop it with `pkill -f tsx` or `pkill -f 'src/index.ts'`.
