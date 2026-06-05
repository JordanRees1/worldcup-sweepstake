# Work sweepstake

Drop the 24 members' picks into `player_picks.csv` (one row per pick):

```csv
player,team
Alice,Brazil
Alice,Japan
Bob,France
Bob,Morocco
...
```

Rules for this sweepstake (`sweepstake.json`): **24 players × 2 teams = all 48 World Cup teams, owned once each.**

After editing the CSV, generate the mapping report to catch typos / unmatched names before going live:

```bash
npm run report:picks:work
```

That writes `picks.normalized.json` and `PICKS_MAPPING_REPORT.md` into this folder. Fix any ❓ unmatched picks (add the spelling to `server/src/data/aliases.ts` or correct the CSV) until all 48 resolve, then run the app:

```bash
# Windows PowerShell
$env:SWEEPSTAKE = "work"; npm run dev
# macOS / Linux
SWEEPSTAKE=work npm run dev
```
