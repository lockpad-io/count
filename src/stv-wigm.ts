import { SCALE, fixed, format, mulDiv, type Fixed } from './fixed.ts'
import { splitFormal } from './formality.ts'
import type { ElectionResult, Round } from './results.ts'
import { breakTie, byTallyThenIndex, findDecision } from './ties.ts'
import type { ElectionQuestion, TieKind } from './types.ts'

interface Paper {
    preferences: number[]
    weight: Fixed
}

type Standing = 'continuing' | 'elected' | 'excluded'

/**
 * Proportional representation by single transferable vote, using the weighted inclusive Gregory
 * method. Quota floor(formal / (seats + 1)) + 1. A surplus moves every ballot in the elected
 * candidate's pile, each at a new weight of surplus × its weight ÷ the candidate's total,
 * truncated once to 6 decimal places, as in the Scottish statutory rules (which use 5). An
 * excluded candidate's ballots all move at once, at their current weights. See METHODS.md.
 */
export function countStvWigm(q: ElectionQuestion): ElectionResult {
    const { formal, informal } = splitFormal(q)
    const quota = fixed(Math.floor(formal.length / (q.seats + 1)) + 1)
    const standing: Standing[] = q.candidates.map(() => 'continuing')
    const piles: Paper[][] = q.candidates.map(() => [])
    const tallies: Fixed[] = q.candidates.map(() => 0n)
    const pending = new Set<number>()
    const history: Fixed[][] = []
    const rounds: Round[] = []
    const elected: number[] = []
    let exhausted: Fixed = 0n
    let lost: Fixed = 0n

    const continuing = () => standing.flatMap((s, c) => (s === 'continuing' ? [c] : []))

    /** Gives a ballot to its next continuing preference, or exhausts it. */
    const place = (paper: Paper) => {
        const next = paper.preferences.find(c => standing[c] === 'continuing')
        if (next === undefined) {
            exhausted += paper.weight
        } else {
            piles[next]!.push(paper)
            tallies[next]! += paper.weight
        }
    }

    const elect = (candidates: number[], round: Round) => {
        for (const c of candidates) {
            standing[c] = 'elected'
            elected.push(c)
            round.elected.push(c)
            if (tallies[c]! > quota) {
                pending.add(c)
            }
        }
    }

    const record = (action: Round['action'], excluded: number[], ties: Round['ties']): Round => {
        const round: Round = {
            number: rounds.length + 1,
            action,
            tallies: [],
            exhausted: '',
            lostToRounding: '',
            elected: [],
            excluded,
            ties,
        }
        // Everyone who reaches the quota is elected in the round that brought them there.
        elect(
            byTallyThenIndex(continuing(), tallies).filter(c => tallies[c]! >= quota),
            round
        )
        round.tallies = tallies.map(format)
        round.exhausted = format(exhausted)
        round.lostToRounding = format(lost)
        history.push([...tallies])
        rounds.push(round)

        return round
    }

    const result = (extra: Partial<ElectionResult> = {}): ElectionResult => ({
        kind: 'election',
        questionId: q.id,
        method: 'stv-wigm',
        status: extra.unresolvedTie === undefined ? 'complete' : 'tie-unresolved',
        formal: formal.length,
        informal,
        quota: format(quota),
        elected: [...elected],
        rounds,
        ...extra,
    })

    /**
     * Settles a tie the count can't avoid: countback first, then a recorded decision. Returns the
     * chosen candidate, or the tie to report when neither settles it.
     */
    const settle = (
        tied: number[],
        kind: TieKind,
        lowest: boolean,
        ties: Round['ties']
    ): number | { round: number; kind: TieKind; tied: number[] } => {
        const survivors = breakTie(tied, history.slice(0, -1), lowest)
        if (survivors.length === 1) {
            ties.push({ kind, tied, chosen: survivors[0]!, by: 'countback' })

            return survivors[0]!
        }
        const round = rounds.length + 1
        const decision = findDecision(q.tieDecisions, round, kind, survivors)
        if (decision === undefined) {
            return { round, kind, tied: survivors }
        }
        ties.push({ kind, tied: survivors, chosen: decision.chosen, by: 'decision' })

        return decision.chosen
    }

    for (const preferences of formal) {
        place({ preferences, weight: SCALE })
    }
    record({ type: 'first-count' }, [], [])
    if (q.candidates.length > q.seats && formal.length === 0) {
        // Nothing to count, and no seat can be filled without a choice the ballots didn't make.
        return result()
    }

    for (;;) {
        const remaining = q.seats - elected.length
        if (remaining === 0) {
            return result()
        }

        const left = continuing()
        if (left.length <= remaining) {
            elect(byTallyThenIndex(left, tallies), rounds.at(-1)!)

            return result()
        }

        const ties: Round['ties'] = []

        if (pending.size > 0) {
            const surpluses = [...pending]
            const largest = surpluses.reduce((max, c) => (tallies[c]! > max ? tallies[c]! : max), 0n)
            const tied = surpluses.filter(c => tallies[c] === largest).sort((a, b) => a - b)
            const from = tied.length === 1 ? tied[0]! : settle(tied, 'surplus-order', false, ties)
            if (typeof from !== 'number') {
                return result({ unresolvedTie: from })
            }

            const total = tallies[from]!
            const surplus = total - quota
            let moved: Fixed = 0n
            for (const paper of piles[from]!.splice(0)) {
                paper.weight = mulDiv(surplus, paper.weight, total)
                moved += paper.weight
                place(paper)
            }
            lost += surplus - moved
            tallies[from] = quota
            pending.delete(from)
            // The transfer value is the new weight of a ballot worth one vote.
            record({ type: 'surplus', from, transferValue: format(mulDiv(surplus, SCALE, total)) }, [], ties)
            continue
        }

        const lowest = left.reduce((min, c) => (tallies[c]! < min ? tallies[c]! : min), tallies[left[0]!]!)
        const atLowest = left.filter(c => tallies[c] === lowest)
        let excluded: number[]
        if (atLowest.length === 1 || (lowest === 0n && left.length - atLowest.length >= remaining)) {
            excluded = atLowest
        } else {
            const chosen = settle(atLowest, 'exclude', true, ties)
            if (typeof chosen !== 'number') {
                return result({ unresolvedTie: chosen })
            }
            excluded = [chosen]
        }

        const moving = excluded.flatMap(c => piles[c]!.splice(0))
        for (const c of excluded) {
            standing[c] = 'excluded'
            tallies[c] = 0n
        }
        moving.forEach(place)
        record({ type: 'exclude', candidates: excluded }, excluded, ties)
    }
}
