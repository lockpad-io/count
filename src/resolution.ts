import type { ResolutionResult } from './results.ts'
import type { ResolutionQuestion } from './types.ts'

/**
 * A resolution carries when the votes for it reach the threshold of the base: more than, or at
 * least, numerator/denominator of it. A base of zero never carries.
 */
export function countResolution(q: ResolutionQuestion): ResolutionResult {
    const count = (answer: ResolutionQuestion['ballots'][number]) => q.ballots.filter(b => b === answer).length
    const votesFor = count('for')
    const against = count('against')
    const abstain = count('abstain')

    const base = q.base === 'for-against' ? votesFor + against : q.base === 'all-ballots' ? q.ballots.length : q.base.fixed
    const { rule, numerator, denominator } = q.threshold
    const support = BigInt(votesFor) * BigInt(denominator)
    const needed = BigInt(base) * BigInt(numerator)
    const carried = base > 0 && (rule === 'more-than' ? support > needed : support >= needed)

    return {
        kind: 'resolution',
        questionId: q.id,
        for: votesFor,
        against,
        abstain,
        base,
        required: { rule, numerator, denominator },
        carried,
    }
}
