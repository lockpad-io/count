import { sha256Hex } from './sha256.ts'
import { asciiTrim, compareLists, compareText } from './text.ts'
import type {
    BallotFile,
    ElectionQuestion,
    Method,
    Question,
    ResolutionQuestion,
    TieDecision,
    TieKind,
} from './types.ts'

export const NOTICE_TEXT =
    'This file holds every ballot without any link to a voter. An unusual ranking could still identify a voter to someone who told them how to rank, so share it only when you need to.'

/** A ballot file that can't be read, with a message a person can act on. */
export class BallotFileError extends Error {
    override name = 'BallotFileError'
}

const METHODS: readonly Method[] = ['plurality', 'irv', 'stv-wigm']
const TIE_KINDS: readonly TieKind[] = ['exclude', 'surplus-order', 'elect']
const ANSWERS = ['abstain', 'against', 'for'] as const

type Raw = Record<string, unknown>

function fail(where: string, message: string): never {
    throw new BallotFileError(`${where}: ${message}`)
}

function isObject(value: unknown): value is Raw {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isWhole(value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number {
    return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max
}

function checkKeys(raw: Raw, allowed: readonly string[], where: string): void {
    for (const key of Object.keys(raw)) {
        if (!allowed.includes(key)) {
            fail(where, `unknown field "${key}".`)
        }
    }
}

function text(raw: Raw, key: string, where: string): string {
    const value = raw[key]
    if (typeof value !== 'string') {
        fail(where, `${key} should be text.`)
    }

    return value
}

function list(raw: Raw, key: string, where: string): unknown[] {
    const value = raw[key]
    if (!Array.isArray(value)) {
        fail(where, `${key} should be a list.`)
    }

    return value
}

/** Reads and checks a lockpad ballot file. Throws BallotFileError, saying what is wrong and where. */
export function parseBallotFile(json: string): BallotFile {
    let raw: unknown
    try {
        raw = JSON.parse(json.replace(/^\ufeff/, ''))
    } catch {
        throw new BallotFileError("This file isn't valid JSON.")
    }

    const where = 'The file'
    if (!isObject(raw)) {
        fail(where, 'it should be an object.')
    }
    if (raw.format !== 'lockpad-ballots') {
        fail(where, "this isn't a lockpad ballot file.")
    }
    if (raw.version !== 1) {
        fail(where, `it is version ${String(raw.version)} of the format; this engine can only read version 1.`)
    }
    checkKeys(raw, ['format', 'version', 'engine', 'title', 'notice', 'questions'], where)
    if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
        fail(where, 'it has no questions.')
    }

    const engine = text(raw, 'engine', where)
    const title = text(raw, 'title', where)
    const notice = text(raw, 'notice', where)
    if (notice !== NOTICE_TEXT) {
        fail(where, 'notice should be the standard notice about distinctive rankings.')
    }
    const ids = new Set<string>()
    const questions = raw.questions.map((question, i): Question => {
        const parsed = parseQuestion(question, `Question ${i + 1}`)
        const id = parsed.id.normalize('NFC')
        if (ids.has(id)) {
            fail(`Question ${i + 1}`, `id "${parsed.id}" is used twice.`)
        }
        ids.add(id)

        return parsed
    })

    return { format: 'lockpad-ballots', version: 1, engine, title, notice, questions }
}

function parseQuestion(raw: unknown, position: string): Question {
    if (!isObject(raw)) {
        fail(position, 'it should be an object.')
    }
    const id = text(raw, 'id', position)
    if (asciiTrim(id) === '') {
        fail(position, 'id should not be empty.')
    }
    const where = `${position} (${id})`

    if (raw.kind === 'election') {
        return parseElection(raw, id, where)
    }
    if (raw.kind === 'resolution') {
        return parseResolution(raw, id, where)
    }

    return fail(where, 'kind should be "election" or "resolution".')
}

function parseElection(raw: Raw, id: string, where: string): ElectionQuestion {
    checkKeys(
        raw,
        ['id', 'kind', 'title', 'method', 'seats', 'candidates', 'minPreferences', 'ballots', 'tieDecisions'],
        where
    )
    const title = text(raw, 'title', where)
    const method = raw.method as Method
    if (!METHODS.includes(method)) {
        fail(where, `method should be one of ${METHODS.join(', ')}.`)
    }
    if (!isWhole(raw.seats, 1)) {
        fail(where, 'seats should be a whole number of at least 1.')
    }
    const seats = raw.seats
    if (method === 'irv' && seats !== 1) {
        fail(where, 'instant runoff elects exactly one candidate, so seats should be 1.')
    }

    const candidates = list(raw, 'candidates', where).map((name, i) => {
        if (typeof name !== 'string') {
            fail(where, `candidate ${i + 1} should be text.`)
        }
        if (asciiTrim(name) === '') {
            fail(where, `candidate ${i + 1} has no name.`)
        }

        return name
    })
    if (candidates.length === 0) {
        fail(where, 'it needs at least one candidate.')
    }
    const names = new Set<string>()
    for (const name of candidates) {
        const key = asciiTrim(name.normalize('NFC'))
        if (names.has(key)) {
            fail(where, `candidate "${name}" is listed twice.`)
        }
        names.add(key)
    }

    const mostMarks = method === 'plurality' ? Math.min(seats, candidates.length) : candidates.length
    if (!isWhole(raw.minPreferences, 0, mostMarks)) {
        fail(where, `minPreferences should be a whole number from 0 to ${mostMarks}.`)
    }
    const minPreferences = raw.minPreferences

    const ballots = list(raw, 'ballots', where).map((ballot, i) => {
        if (!Array.isArray(ballot) || !ballot.every(mark => Number.isSafeInteger(mark))) {
            fail(where, `ballot ${i + 1} should be a list of candidate numbers.`)
        }

        return ballot as number[]
    })

    const tieDecisions = list(raw, 'tieDecisions', where).map((decision, i) =>
        parseTieDecision(decision, candidates.length, `${where}, tie decision ${i + 1}`)
    )
    tieDecisions.forEach((decision, i) => {
        const earlier = tieDecisions.findIndex(
            other =>
                other.round === decision.round &&
                other.kind === decision.kind &&
                compareLists(other.tied, decision.tied) === 0
        )
        if (earlier < i) {
            fail(where, `tie decision ${i + 1} repeats tie decision ${earlier + 1}.`)
        }
    })

    return { id, kind: 'election', title, method, seats, candidates, minPreferences, ballots, tieDecisions }
}

function parseTieDecision(raw: unknown, candidateCount: number, where: string): TieDecision {
    if (!isObject(raw)) {
        fail(where, 'it should be an object.')
    }
    checkKeys(raw, ['round', 'kind', 'tied', 'chosen', 'how', 'witnessValue'], where)
    if (!isWhole(raw.round, 1)) {
        fail(where, 'round should be a whole number of at least 1.')
    }
    const kind = raw.kind as TieKind
    if (!TIE_KINDS.includes(kind)) {
        fail(where, `kind should be one of ${TIE_KINDS.join(', ')}.`)
    }

    const tied = raw.tied
    if (
        !Array.isArray(tied) ||
        tied.length < 2 ||
        !tied.every((c, i) => Number.isSafeInteger(c) && (i === 0 || (c as number) > (tied[i - 1] as number)))
    ) {
        fail(where, 'tied should list at least two candidates in ascending order.')
    }
    for (const candidate of tied as number[]) {
        if (candidate < 0 || candidate >= candidateCount) {
            fail(where, `candidate ${candidate + 1} doesn't exist.`)
        }
    }
    if (!(tied as number[]).includes(raw.chosen as number)) {
        fail(where, 'chosen should be one of the tied candidates.')
    }

    const decision: TieDecision = { round: raw.round, kind, tied: tied as number[], chosen: raw.chosen as number, how: 'entered' }
    if (raw.how === 'draw') {
        if (typeof raw.witnessValue !== 'string' || asciiTrim(raw.witnessValue) === '') {
            fail(where, 'a draw needs its witnessValue, the value the witness entered.')
        }

        return { ...decision, how: 'draw', witnessValue: raw.witnessValue }
    }
    if (raw.how !== 'entered') {
        fail(where, 'how should be "draw" or "entered".')
    }
    if ('witnessValue' in raw) {
        fail(where, 'only a draw has a witnessValue.')
    }

    return decision
}

function parseResolution(raw: Raw, id: string, where: string): ResolutionQuestion {
    checkKeys(raw, ['id', 'kind', 'title', 'motion', 'threshold', 'base', 'ballots'], where)
    const title = text(raw, 'title', where)
    const motion = text(raw, 'motion', where)

    const threshold = raw.threshold
    if (!isObject(threshold)) {
        fail(where, 'threshold should be an object.')
    }
    checkKeys(threshold, ['rule', 'numerator', 'denominator'], `${where}, threshold`)
    if (threshold.rule !== 'more-than' && threshold.rule !== 'at-least') {
        fail(where, 'threshold rule should be "more-than" or "at-least".')
    }
    if (!isWhole(threshold.denominator, 1) || !isWhole(threshold.numerator, 0, threshold.denominator)) {
        fail(where, 'threshold should be a fraction from 0 to 1, such as 3 over 4.')
    }

    let base: ResolutionQuestion['base']
    if (raw.base === 'for-against' || raw.base === 'all-ballots') {
        base = raw.base
    } else if (isObject(raw.base) && Object.keys(raw.base).length === 1 && isWhole(raw.base.fixed, 0)) {
        base = { fixed: raw.base.fixed }
    } else {
        fail(where, 'base should be "for-against", "all-ballots" or {"fixed": n}.')
    }

    const ballots = list(raw, 'ballots', where).map((answer, i) => {
        if (!(ANSWERS as readonly unknown[]).includes(answer)) {
            fail(where, `ballot ${i + 1} should be "for", "against" or "abstain".`)
        }

        return answer as ResolutionQuestion['ballots'][number]
    })

    return {
        id,
        kind: 'resolution',
        title,
        motion,
        threshold: { rule: threshold.rule, numerator: threshold.numerator, denominator: threshold.denominator },
        base,
        ballots,
    }
}

function str(s: string): string {
    return JSON.stringify(s.normalize('NFC'))
}

function numbers(values: readonly number[]): string {
    return `[${values.join(',')}]`
}

function canonicalTieDecision(d: TieDecision): string {
    const witness = d.witnessValue === undefined ? '' : `,"witnessValue":${str(d.witnessValue)}`

    return `{"round":${d.round},"kind":${str(d.kind)},"tied":${numbers(d.tied)},"chosen":${d.chosen},"how":${str(d.how)}${witness}}`
}

function canonicalElection(q: ElectionQuestion): string {
    const ballots = q.ballots
        .map(ballot => (q.method === 'plurality' ? [...ballot].sort((a, b) => a - b) : ballot))
        .sort(compareLists)
    const decisions = [...q.tieDecisions].sort(
        (a, b) => a.round - b.round || compareText(a.kind, b.kind) || compareLists(a.tied, b.tied)
    )

    return (
        `{"id":${str(q.id)},"kind":"election","title":${str(q.title)},"method":${str(q.method)},` +
        `"seats":${q.seats},"candidates":[${q.candidates.map(str).join(',')}],` +
        `"minPreferences":${q.minPreferences},"ballots":[${ballots.map(numbers).join(',')}],` +
        `"tieDecisions":[${decisions.map(canonicalTieDecision).join(',')}]}`
    )
}

function canonicalResolution(q: ResolutionQuestion): string {
    const t = q.threshold
    const base = typeof q.base === 'string' ? str(q.base) : `{"fixed":${q.base.fixed}}`
    const ballots = ANSWERS.flatMap(answer => q.ballots.filter(b => b === answer).map(str))

    return (
        `{"id":${str(q.id)},"kind":"resolution","title":${str(q.title)},"motion":${str(q.motion)},` +
        `"threshold":{"rule":${str(t.rule)},"numerator":${t.numerator},"denominator":${t.denominator}},` +
        `"base":${base},"ballots":[${ballots.join(',')}]}`
    )
}

/**
 * The file's one byte-exact form: keys in the declared order, strings in NFC, ballots and tie
 * decisions sorted, no whitespace. The downloadable file is exactly these bytes.
 */
export function canonicalJson(file: BallotFile): string {
    const questions = file.questions.map(q => (q.kind === 'election' ? canonicalElection(q) : canonicalResolution(q)))

    return (
        `{"format":"lockpad-ballots","version":1,"engine":${str(file.engine)},"title":${str(file.title)},` +
        `"notice":${str(file.notice)},"questions":[${questions.join(',')}]}`
    )
}

/** The hash of the ballots alone, without tie decisions: the seed for every draw. */
export function ballotsHash(file: BallotFile): string {
    return sha256Hex(
        canonicalJson({
            ...file,
            questions: file.questions.map(q => (q.kind === 'election' ? { ...q, tieDecisions: [] } : q)),
        })
    )
}

/** The hash of the whole canonical file, shown on the statement of result. */
export function fileHash(file: BallotFile): string {
    return sha256Hex(canonicalJson(file))
}
