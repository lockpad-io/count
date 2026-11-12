import { SCALE, format, type Fixed } from './fixed.ts'
import { splitFormal } from './formality.ts'
import type { ElectionResult, Round } from './results.ts'
import { byTallyThenIndex, findDecision } from './ties.ts'
import type { ElectionQuestion } from './types.ts'

/**
 * Block plurality, in one round: each formal ballot gives one vote to every candidate it marks,
 * and the `seats` candidates with the most votes are elected. A tie at the boundary is settled
 * by `elect` decisions, one seat at a time.
 */
export function countPlurality(q: ElectionQuestion): ElectionResult {
    const { formal, informal } = splitFormal(q)
    const tallies: Fixed[] = q.candidates.map(() => 0n)
    for (const ballot of formal) {
        for (const candidate of ballot) {
            tallies[candidate]! += SCALE
        }
    }

    const everyone = q.candidates.map((_, i) => i)
    const ranked = byTallyThenIndex(everyone, tallies)
    let elected: number[] = []
    const ties: Round['ties'] = []
    let unresolvedTie: ElectionResult['unresolvedTie']

    if (everyone.length <= q.seats) {
        elected = ranked
    } else if (formal.length > 0) {
        const boundary = tallies[ranked[q.seats - 1]!]!
        elected = ranked.filter(c => tallies[c]! > boundary)
        let tied = everyone.filter(c => tallies[c] === boundary)

        while (elected.length < q.seats) {
            if (tied.length <= q.seats - elected.length) {
                elected = elected.concat(tied)
                break
            }
            const decision = findDecision(q.tieDecisions, 1, 'elect', tied)
            if (decision === undefined) {
                unresolvedTie = { round: 1, kind: 'elect', tied }
                break
            }
            ties.push({ kind: 'elect', tied, chosen: decision.chosen, by: 'decision' })
            elected.push(decision.chosen)
            tied = tied.filter(c => c !== decision.chosen)
        }
    }

    const round: Round = {
        number: 1,
        action: { type: 'first-count' },
        tallies: tallies.map(format),
        exhausted: format(0n),
        lostToRounding: format(0n),
        elected,
        excluded: [],
        ties,
    }

    return {
        kind: 'election',
        questionId: q.id,
        method: 'plurality',
        status: unresolvedTie === undefined ? 'complete' : 'tie-unresolved',
        formal: formal.length,
        informal,
        elected: [...elected],
        rounds: [round],
        ...(unresolvedTie === undefined ? {} : { unresolvedTie }),
    }
}
