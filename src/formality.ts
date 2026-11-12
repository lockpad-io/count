import type { ElectionQuestion } from './types.ts'

/**
 * A ballot counts only if every mark is a real candidate, marked once, with at least
 * max(1, minPreferences) marks, and, for plurality, no more marks than seats.
 */
export function isFormal(q: ElectionQuestion, ballot: readonly number[]): boolean {
    const most = q.method === 'plurality' ? q.seats : q.candidates.length
    if (ballot.length < Math.max(1, q.minPreferences) || ballot.length > most) {
        return false
    }

    const seen = new Set<number>()
    for (const candidate of ballot) {
        if (!Number.isInteger(candidate) || candidate < 0 || candidate >= q.candidates.length || seen.has(candidate)) {
            return false
        }
        seen.add(candidate)
    }

    return true
}

/** The formal ballots, in their original order, and how many were informal. */
export function splitFormal(q: ElectionQuestion): { formal: number[][]; informal: number } {
    const formal = q.ballots.filter(ballot => isFormal(q, ballot))

    return { formal, informal: q.ballots.length - formal.length }
}
