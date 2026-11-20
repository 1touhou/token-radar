# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/1touhou/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/1touhou/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: it reads a sealed snapshot of DeFi protocols from DefiLlama, ranks the protocols that record no token by an implied value computed from the snapshot's own figures (TVL, seven-day growth, age with no token, chain breadth), and shows every protocol a concrete farm plan with costs and time.

The board covers all 40 watchlist protocols plus 186 more pre-token protocols below the floor, 226 rows in all. Protocols whose token already trades are set aside in their own tab.

## Run it

```sh
node main.ts --input <snapshot.json>
```

It writes the ranked board to `/output/board.json`, the dashboard data to `/output/data.js`, and copies `dashboard/` and `screenshots/` to `/output`, plus a `dossier.json` the judge reads.

---

<sub>Entered on [make.fun](https://make.fun/?ref=3bes5xfn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
