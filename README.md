# @lockpad/count

The vote-counting engine behind [lockpad](https://lockpad.io). It counts block plurality,
preferential voting (instant runoff) and proportional representation (single transferable vote
by the weighted inclusive Gregory method), plus resolutions. The same file counts in the browser,
in the free counter, and on lockpad's server when a ballot closes. So anyone can recount a
lockpad result and get the same answer, to the last decimal place.

**What it is:** a pure function from ballots to a result. It has no dependencies, does no I/O,
and uses no clock, randomness or locale.

**What it isn't:** a voting system. It doesn't check who may vote, keep ballots secret or store
anything. lockpad does those things; this package only counts.

## Methods

| Method | `method` | Seats |
|---|---|---|
| Block plurality | `plurality` | 1 or more |
| Preferential (instant runoff), full or optional | `irv` | 1 |
| Proportional representation: STV, weighted inclusive Gregory | `stv-wigm` | 1 or more |
| Resolution: more than, or at least, a fraction of a base | (`kind: "resolution"`) | n/a |

[METHODS.md](METHODS.md) explains each method in plain words, with its official sources and the
two published counts the tests check it against.

## Rounding

Every vote value is a fixed-point number with exactly 6 decimal places, stored as a whole
number of millionths in `BigInt`. Any division truncates toward zero. In an STV surplus transfer,
each ballot's new value is surplus × its value ÷ the candidate's total, truncated once. Whatever
truncation drops is shown in each round as `lostToRounding`, so in a preferential or STV count
every round's tallies, exhausted votes and lost votes add up to the number of formal ballots.
(In block plurality a ballot can vote for several candidates, so the tallies add up to the
marks.)

## The lockpad ballot file

A ballot file holds every ballot of an event, with no link to any voter:

```json
{
  "format": "lockpad-ballots",
  "version": 1,
  "engine": "1.0.0",
  "title": "AGM 2026",
  "notice": "This file holds every ballot without any link to a voter. …",
  "questions": [
    {
      "id": "committee",
      "kind": "election",
      "title": "Committee",
      "method": "stv-wigm",
      "seats": 2,
      "candidates": ["Alice", "Bob", "Carol"],
      "minPreferences": 1,
      "ballots": [[0, 1], [1], [2, 0, 1]],
      "tieDecisions": []
    }
  ]
}
```

- Candidates are numbered from 0 in the order listed, and a ballot lists them in preference
  order.
- Informal ballots stay in the file. They are counted as informal and play no part in the count.
- The file has one exact byte form, `canonicalJson`: keys in a fixed order, strings in Unicode
  NFC, ballots and tie decisions sorted, no whitespace. The file lockpad lets you download is
  exactly those bytes.
- **`fileHash`** is the SHA-256 of those bytes, so `sha256sum` of the download matches the hash
  printed on lockpad's statement of result.
- **`ballotsHash`** is the same hash with every tie decision left out. It seeds the draw.

## Ties

A count avoids tie decisions wherever it can:

- candidates who are all elected anyway are listed in candidate order;
- candidates on zero votes are excluded together;
- countback looks back through earlier rounds.

When a tie still decides who is excluded, elected or transferred first, the file must record a
decision for that round and tie. Without one, the count stops with `status: "tie-unresolved"`
and names the tie. A decision is either entered by the returning officer under the
association's rules (`"how": "entered"`), or made by the **seeded draw** (`"how": "draw"`), which
anyone can check.

### The seeded draw

A witness chooses a value, such as a word, once for the tie. lockpad joins these six lines:

```
84d7bad020b4b6da3189c797d5499b70555dbd0507c4d32f0f1cab986876efa2   ← ballotsHash
president                                                           ← question id
2                                                                   ← round
exclude                                                             ← kind of tie
1,2                                                                 ← the tied candidates
kookaburra                                                          ← witness value
```

It takes their SHA-256:

```
847a135f4f4484fb4201b571c6eff6c40f6dbe1c7ec03e6a87c861d508b2e972
```

and reads that as a number. Its remainder after dividing by the number of tied candidates picks
one of them, in ascending order. Here two candidates are tied, `[1, 2]`, and the remainder is 0,
so candidate 1 is excluded. This is `vectors/irv-drawn-decision.json`. Because the tied candidates are part of the seed,
a tie that needs several draws in a row, such as four tied for three seats, gets an independent
draw each time from the one witness value. Before counting, the
engine recomputes every drawn decision in a file and refuses a file whose decision doesn't
match.

## Recount a lockpad ballot file

In a browser, open lockpad's free counter and load the file.

On your own computer, with Node 24:

```sh
npm ci && npm run build
node dist/cli.mjs < ballots.json
```

The output is the full result as JSON: every round, every transfer, and the `fileHash` and
`ballotsHash`. A file the engine can't read gives `{"error": "…"}` and exit code 2.
`dist/BUNDLE-SHA256` holds the SHA-256 of `dist/lockpad-count.mjs`. lockpad prints it on each
statement of result, so you can check the engine that counted is the one you built.

From code:

```ts
import { countFile, parseBallotFile } from '@lockpad/count'

const { results, fileHash } = countFile(parseBallotFile(json))
```

`countFile` counts the object it is given as it stands. Pass it a file from `parseBallotFile`,
which checks everything a count relies on; to count a file you built in code, count
`parseBallotFile(canonicalJson(file))`.

`parseBlt`/`toBlt` and `parseCsv`/`toCsv` read and write the `.blt` format other counting
programs use, and CSV from spreadsheets.

## Browser support

The engine needs `BigInt`: Safari 14 or later, Chrome 67 or later, or Firefox 68 or later.

## Development

```sh
npm ci
npm run typecheck
npm run test:coverage   # 100% lines, branches, functions and statements, enforced
npm run test:perf       # 3,000 ballots, 20 candidates, 7 seats of STV in under 2 seconds
npm run build
```

`vectors/` holds ballot files with the exact output each must count to. They were checked by
hand, or against published official counts, in `test/`. `scripts/write-vectors.mjs` rewrites
them. Run it only after a deliberate change to a counting rule, and review every changed line.

## Licence

MIT. Copyright (c) 2026 Skylake Digital Pty Ltd.
