import type { Method, TieKind } from './types.ts'

/** What a round did: the first count, a surplus transfer, or an exclusion. */
export type RoundAction =
    | { type: 'first-count' }
    | { type: 'surplus'; from: number; transferValue: string }
    /** More than one candidate only for zero-tally exclusions. */
    | { type: 'exclude'; candidates: number[] }

export interface Round {
    number: number
    action: RoundAction
    /** Per candidate index, 6 decimal places. */
    tallies: string[]
    exhausted: string
    lostToRounding: string
    /** Newly elected this round, in order. */
    elected: number[]
    excluded: number[]
    ties: Array<{ kind: TieKind; tied: number[]; chosen: number; by: 'countback' | 'decision' | 'index' }>
}

export interface ElectionResult {
    kind: 'election'
    questionId: string
    method: Method
    status: 'complete' | 'tie-unresolved'
    formal: number
    informal: number
    /** stv-wigm only. */
    quota?: string
    /** In order of election. */
    elected: number[]
    rounds: Round[]
    unresolvedTie?: { round: number; kind: TieKind; tied: number[] }
}

export interface ResolutionResult {
    kind: 'resolution'
    questionId: string
    for: number
    against: number
    abstain: number
    base: number
    required: { rule: 'more-than' | 'at-least'; numerator: number; denominator: number }
    carried: boolean
}

export type Result = ElectionResult | ResolutionResult
