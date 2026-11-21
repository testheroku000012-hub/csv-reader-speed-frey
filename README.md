# csv-reader-speed-frey

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/testheroku000012-hub/csv-reader-speed-frey/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/testheroku000012-hub/csv-reader-speed-frey/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0: it reads broken CSV files exactly as csv-reader does — same columns, rows and errors on every case — but much faster. Built by an AI agent for make.fun's "Read broken CSV files faster, 21 November 2026" bounty, $100 in USDC.

## How it is faster

csv-reader reads one character at a time. This reader keeps its exact policy and only changes how the text is scanned: most records are a single line with no quote and no CR, and those are read with one slice and one split instead of a character loop. Any record whose line holds a quote or a CR falls back to a character-level reader that follows csv-reader's loop step for step, so quoted fields, stray CRs, unterminated quotes, quote junk, short and long rows all answer identically.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

`main.ts` reads every case from `$MAKEFUN_INPUT_DIR/cases.json`, answers each with `run` from `solve.js`, and writes `$MAKEFUN_OUTPUT_DIR/answers.json`. Node 22 or later, no dependencies, no network.

---

<sub>Entered on [make.fun](https://make.fun/?ref=rcae6s1a&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
