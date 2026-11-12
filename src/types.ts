/** The counting methods: block plurality, instant runoff, and STV by the weighted inclusive Gregory method. */
export type Method = 'plurality' | 'irv' | 'stv-wigm'

/** What a tie decides: who is excluded, whose surplus moves first, or who is elected. */
export type TieKind = 'exclude' | 'surplus-order' | 'elect'

/**
 * How a tie that countback couldn't break was settled, recorded in the ballot file so a recount
 * gives the same result. `round` is the round that performs the action.
 */
export interface TieDecision {
    round: number
    kind: TieKind
    /** The candidates still tied after countback, ascending. */
    tied: number[]
    chosen: number
    how: 'draw' | 'entered'
    /** The value the witness entered; present exactly when `how` is `draw`. */
    witnessValue?: string
}

export interface ElectionQuestion {
    id: string
    kind: 'election'
    title: string
    method: Method
    seats: number
    candidates: string[]
    minPreferences: number
    /** Candidate indices, in preference order (any order for plurality). */
    ballots: number[][]
    tieDecisions: TieDecision[]
}

export interface ResolutionQuestion {
    id: string
    kind: 'resolution'
    title: string
    motion: string
    threshold: { rule: 'more-than' | 'at-least'; numerator: number; denominator: number }
    base: 'for-against' | 'all-ballots' | { fixed: number }
    ballots: Array<'for' | 'against' | 'abstain'>
}

export type Question = ElectionQuestion | ResolutionQuestion

/** The lockpad ballot file: every ballot of an event, with no link to any voter. */
export interface BallotFile {
    format: 'lockpad-ballots'
    version: 1
    engine: string
    title: string
    /** Always NOTICE_TEXT, the warning about distinctive rankings. */
    notice: string
    questions: Question[]
}
