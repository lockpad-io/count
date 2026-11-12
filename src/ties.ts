import type { Fixed } from './fixed.ts'
import { compareLists } from './text.ts'
import type { TieDecision, TieKind } from './types.ts'

/**
 * Backward countback. Walks the earlier rounds from the most recent back, and at each round where
 * the still-tied candidates' tallies differ, keeps only those on the lowest tally (or the
 * highest). Returns the survivors: one candidate when the tie is broken.
 *
 * @param history tallies per round, oldest first, not including the current round
 */
export function breakTie(tied: readonly number[], history: readonly (readonly Fixed[])[], lowest: boolean): number[] {
    let survivors = [...tied]

    for (let round = history.length - 1; round >= 0 && survivors.length > 1; round--) {
        const tallies = history[round]!
        let best = tallies[survivors[0]!]!
        for (const candidate of survivors) {
            const tally = tallies[candidate]!
            if (lowest ? tally < best : tally > best) {
                best = tally
            }
        }
        survivors = survivors.filter(candidate => tallies[candidate] === best)
    }

    return survivors
}

/** The recorded decision for exactly this round, kind and tied set, if there is one. */
export function findDecision(
    decisions: readonly TieDecision[],
    round: number,
    kind: TieKind,
    tied: readonly number[]
): TieDecision | undefined {
    return decisions.find(d => d.round === round && d.kind === kind && compareLists(d.tied, tied) === 0)
}

/**
 * Candidates by tally, highest first. A tie here only decides order, never a seat, so it goes to
 * the lowest candidate index.
 */
export function byTallyThenIndex(candidates: readonly number[], tallies: readonly Fixed[]): number[] {
    return [...candidates].sort((a, b) => {
        const difference = tallies[b]! - tallies[a]!
        if (difference !== 0n) {
            return difference > 0n ? 1 : -1
        }

        return a - b
    })
}
