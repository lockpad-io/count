import { SCALE, format, type Fixed } from './fixed.ts'
import { splitFormal } from './formality.ts'
import type { ElectionResult, Round } from './results.ts'
import { breakTie, findDecision } from './ties.ts'
import type { ElectionQuestion } from './types.ts'

/**
 * Preferential voting for one seat (instant runoff), with full or optional preferences. Each
 * round, a candidate with more than half the continuing votes is elected; otherwise the lowest
 * is excluded and their ballots move to each ballot's next continuing preference.
 */
export function countIrv(q: ElectionQuestion): ElectionResult {
    if (q.seats !== 1) {
        throw new RangeError('Instant runoff elects exactly one candidate.')
    }

    const { formal, informal } = splitFormal(q)
    const candidateCount = q.candidates.length
    const continuing = new Set(q.candidates.map((_, i) => i))
    const piles: number[][][] = q.candidates.map(() => [])
    let exhausted: Fixed = 0n

    /** Gives a ballot to its first continuing preference, or exhausts it. */
    const place = (ballot: number[]) => {
        const next = ballot.find(candidate => continuing.has(candidate))
        if (next === undefined) {
            exhausted += SCALE
        } else {
            piles[next]!.push(ballot)
        }
    }
    const tallies = () => piles.map(pile => BigInt(pile.length) * SCALE)

    formal.forEach(place)
    const history: Fixed[][] = []
    const rounds: Round[] = []
    const result = (status: ElectionResult['status'], extra: Partial<ElectionResult> = {}): ElectionResult => ({
        kind: 'election',
        questionId: q.id,
        method: 'irv',
        status,
        formal: formal.length,
        informal,
        elected: rounds.flatMap(round => round.elected),
        rounds,
        ...extra,
    })
    const record = (action: Round['action'], excluded: number[], ties: Round['ties']) => {
        const current = tallies()
        history.push(current)
        rounds.push({
            number: rounds.length + 1,
            action,
            tallies: current.map(format),
            exhausted: format(exhausted),
            lostToRounding: format(0n),
            elected: [],
            excluded,
            ties,
        })

        return current
    }

    let current = record({ type: 'first-count' }, [], [])
    if (candidateCount > 1 && formal.length === 0) {
        return result('complete')
    }

    for (;;) {
        const standing = [...continuing]
        const total = standing.reduce((sum, c) => sum + current[c]!, 0n)
        const winner = standing.find(c => current[c]! * 2n > total || standing.length === 1)
        if (winner !== undefined) {
            rounds.at(-1)!.elected.push(winner)

            return result('complete')
        }

        const nextRound = rounds.length + 1
        const lowest = standing.reduce((low, c) => (current[c]! < low ? current[c]! : low), current[standing[0]!]!)
        const atLowest = standing.filter(c => current[c] === lowest)
        let excluded: number[]
        const ties: Round['ties'] = []

        if (lowest === 0n && standing.length - atLowest.length >= 1) {
            excluded = atLowest
        } else if (atLowest.length === 1) {
            excluded = atLowest
        } else {
            const survivors = breakTie(atLowest, history.slice(0, -1), true)
            if (survivors.length === 1) {
                ties.push({ kind: 'exclude', tied: atLowest, chosen: survivors[0]!, by: 'countback' })
                excluded = survivors
            } else {
                const decision = findDecision(q.tieDecisions, nextRound, 'exclude', survivors)
                if (decision === undefined) {
                    return result('tie-unresolved', { unresolvedTie: { round: nextRound, kind: 'exclude', tied: survivors } })
                }
                ties.push({ kind: 'exclude', tied: survivors, chosen: decision.chosen, by: 'decision' })
                excluded = [decision.chosen]
            }
        }

        const moving = excluded.flatMap(c => piles[c]!.splice(0))
        for (const c of excluded) {
            continuing.delete(c)
        }
        moving.forEach(place)
        current = record({ type: 'exclude', candidates: excluded }, excluded, ties)
    }
}
