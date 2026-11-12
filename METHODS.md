# Counting methods

This is how `@lockpad/count` counts each kind of question, in lockpad's own words. Every rule
here is pinned by a test in `test/`, and two of them are checked against published official
counts.

All vote values are fixed-point numbers with 6 decimal places, held as whole millionths in
`BigInt`, so every browser and Node give the same result to the last digit. Wherever a
calculation divides, the result is truncated toward zero, never rounded. A count never uses the
computer's floating-point numbers, the clock, randomness or the locale.

## Which ballots count

A ballot is **formal** (it counts) when:

- every mark is a candidate on the ballot, and no candidate is marked twice;
- it has at least one mark, and at least as many as the question's minimum number of
  preferences;
- for block plurality, it has no more marks than there are seats.

Anything else is **informal**: it is reported in the totals but plays no part in the count.

Preferences count in the order of their numbers, so a gap doesn't make a ballot informal. A paper
marked 1, 3 and 4 counts the 3 as its second preference. The counter's grid flags such a ballot, for
someone to check against the paper.

## Block plurality

For one or more seats. Each formal ballot gives one vote to every candidate it marks, and the
candidates with the most votes fill the seats, all in a single round.

When candidates are level at the last seat and there are more of them than seats left, the
seats are settled one at a time by recorded tie decisions (see Ties).

## Preferential voting (instant runoff)

For one seat, with full or optional preferences.

1. Each formal ballot counts for its first preference.
2. If a candidate holds more than half of the votes still with continuing candidates, they are
   elected. A candidate who is the only one left is elected.
3. Otherwise the candidate with the fewest votes is excluded, and each of their ballots moves
   to its next preference for a candidate still in the count. A ballot with no such preference
   is **exhausted**.
4. Each exclusion is a new round. Repeat from step 2.

## Proportional representation: single transferable vote

For several seats, by the **weighted inclusive Gregory method** (WIGM).

- **Quota:** the number of formal ballots divided by one more than the number of seats, with
  any remainder disregarded, plus one. With 17 ballots and 2 seats, the quota is 6.
- **First count:** every formal ballot is worth 1 vote and goes to its first preference.
  Everyone at or above the quota is elected, highest first.
- **Then, each round does the first of these that applies:**
  1. If every seat is filled, the count is complete.
  2. If the continuing candidates are no more than the seats left, they are all elected,
     highest first, and the count is complete.
  3. If an elected candidate has a surplus (votes above the quota) not yet transferred, the
     largest surplus is transferred. **Every** ballot the candidate holds (that is what
     *inclusive* means) moves to its next preference for a continuing candidate, skipping
     candidates already elected or excluded, and its new value is

     > surplus × the ballot's current value ÷ the candidate's total votes,

     truncated to 6 decimal places (that is what *weighted* means: a ballot that arrived at a
     reduced value passes on a proportionally reduced value). The candidate keeps exactly the
     quota. A ballot with no further preference is exhausted at its new value.
  4. Otherwise the candidate with the fewest votes is excluded, and all of their ballots move
     at once, each at its current value, to its next continuing preference or to exhausted.
- After a transfer or an exclusion, everyone who has reached the quota is elected, highest
  first, and their surplus waits its turn.

The round table shows each round's **transfer value**: the new value of a ballot that was worth
1 vote. A ballot that arrived at a reduced value moves at surplus × its value ÷ total, worked
out afresh, so its new value can differ in the last place from the transfer value times its
old value. Because each ballot's new value is truncated, a little value can be lost in a transfer;
the table shows it as **lost to rounding**, so the tallies, the exhausted votes and the lost
votes always add up to the number of formal ballots.

### Sources, and where lockpad differs

WIGM is the method the Western Australian Legislative Council uses, and the one the
Proportional Representation Society of Australia favours. lockpad follows the statutory texts,
not the Society's copyright rules.

- **Electoral Act 1907 (WA), Schedule 1**
  ([legislation.wa.gov.au](https://www.legislation.wa.gov.au/legislation/prod/filestore.nsf/FileURL/mrdoc_45948.htm/$FILE/Electoral%20Act%201907%20-%20%5B17-c0-01%5D.html)).
  It uses the same quota (cl 3) and the same inclusive, weighted transfer value: the surplus
  divided by all the votes the candidate holds, multiplied by the value at which each ballot
  arrived (cl 4 and 5). Western Australia counts very large elections in whole votes. It
  disregards fractions only when it adds up each bundle of ballots, and it moves an excluded
  candidate's ballots in stages: first preferences, then each earlier transfer in the order it
  arrived (cl 8, 8A, 9 and 11). lockpad keeps 6 decimal places and moves an excluded candidate's
  ballots all at once. In an association-sized ballot, whole-vote rounding would lose a real
  share of each transfer.
- **Scottish Local Government Elections Order 2011, Schedule 1**
  ([legislation.gov.uk](https://www.legislation.gov.uk/ssi/2011/399/schedule/1/made)). It uses
  the same quota (rule 47). Each transferred ballot's value is the surplus times the ballot's
  value, divided by the candidate's total, "to five decimal places (any remainder being
  ignored)" (rule 49), and an excluded candidate's ballots all move at once at their existing
  values (rule 51). lockpad follows this rule exactly, at 6 decimal places instead of 5.

**Checked against a published count.** The tests count the ballots of Ward 4, Shetland Central,
at the 2022 Shetland Islands Council election: 1,414 ballots, 6 candidates and 4 seats (ballot
data from [Denis Mollison's archive](https://www.macs.hw.ac.uk/~denis/stv_elections/SC2022/Shetland/4_Shetland_Central.blt),
result from the [council's stage report](https://shetland.gov.uk/downloads/file/6036/ward-4-shetland-central-votes-per-stage-report)).
lockpad elects the same four councillors in the same stages, the first count matches exactly,
and the surplus transfer moves the same number of ballots to each candidate. That count needed
only one transfer, of first preferences; later transfers and exclusions are pinned by the
hand-checked examples in the tests. The only
difference is the transfer value: 0.316425 to 6 places, against the council's 0.31642 to 5.

## Checked against the AEC

The tests rebuild a set of ballots from the Australian Electoral Commission's published
distribution of preferences for the Division of Clark at the 2025 federal election (67,531
formal votes,
[source](https://results.aec.gov.au/31496/Website/Downloads/HouseDopByDivisionDownload-31496.csv)).
lockpad's instant-runoff count matches the AEC's counts until Andrew Wilkie has a majority, after
the first exclusion. The AEC keeps distributing until two candidates are left, to report the
two-candidate-preferred result; lockpad stops as soon as someone is elected.

## Ties

A count tries never to need a tie decision, in this order:

1. **Order-only ties need nothing.** When candidates are level but all of them are elected
   anyway, they are listed in the order they appear on the ballot.
2. **Candidates with no votes go together.** When the lowest tally is zero, every continuing
   candidate on zero is excluded in one round, as long as that still leaves at least as many
   candidates as seats left to fill.
3. **Countback.** For an exclusion, or for which of two equal surpluses goes first, the count
   looks back through the earlier rounds, most recent first, for the first round in which the
   tied candidates' tallies differed. It excludes the lowest, or transfers the highest
   surplus first.
4. **A recorded decision.** If countback can't separate them, the ballot file must say who was
   chosen, for that round and that tie. A decision is either entered by the returning officer
   under the association's rules, or made by the **seeded draw**: SHA-256 of the ballots hash,
   the question id, the round, the kind of tie, the tied candidates and a value a witness
   chooses, one per line, read as a number, modulo the number of tied candidates, picks the
   candidate. Anyone can recompute it. Because the tied candidates are hashed too, a tie that
   needs several draws in a row gets an independent draw each time.
5. Without a decision, the count stops and reports exactly which tie needs one.

## Resolutions

A resolution carries when the votes **for** it reach the required share of a base:

- the base is the votes for and against, or every ballot (abstentions included), or a number
  entered by hand, such as the members present and entitled to vote;
- the required share is "more than" or "at least" a fraction, such as more than 1/2 or at
  least 3/4, compared exactly with whole numbers;
- a base of zero never carries.
