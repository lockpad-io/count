import { isFormal } from './formality.ts'
import { asciiTrim, compareLists } from './text.ts'
import type { ElectionQuestion } from './types.ts'

/** A .blt file that can't be read, with the line at fault. */
export class BltError extends Error {
    override name = 'BltError'
}

/** The most ballots, and preferences in all, a .blt file may expand to, so a typo in a weight can't hang the page. */
const MOST_BALLOTS = 1_000_000
const MOST_PREFERENCES = 20_000_000

const WHOLE = /^\d+$/

/**
 * Reads the .blt format other counting programs use: a `candidates seats` header, an optional
 * line of withdrawn candidates as negative numbers, ballot lines `weight p1 p2 … 0` with
 * 1-based candidates (optionally led by a ballot id in parentheses), a `0` line, then the
 * quoted candidate names and a quoted title. Withdrawn candidates are removed, from the list and
 * from every ballot. Blank lines and `#` comments are skipped before the names.
 */
export function parseBlt(text: string): { title: string; seats: number; candidates: string[]; ballots: number[][] } {
    const raw = text.replace(/^\ufeff/, '').split(/\r\n|\r|\n/)
    let at = 0
    const nextLine = (): { number: number; text: string } | undefined => {
        while (at < raw.length) {
            const line = asciiTrim(raw[at++]!)
            if (line !== '' && !line.startsWith('#')) {
                return { number: at, text: line }
            }
        }

        return undefined
    }

    const header = nextLine()?.text.split(/[ \t]+/) ?? []
    const candidateCount = Number(header[0])
    const seats = Number(header[1])
    if (header.length !== 2 || !header.every(t => WHOLE.test(t)) || candidateCount < 1 || seats < 1) {
        throw new BltError('A .blt file should start with the number of candidates and seats, such as "4 2".')
    }

    const candidateNumber = (token: string, line: number): number => {
        if (!WHOLE.test(token)) {
            throw new BltError(`Line ${line}: "${token}" isn't a candidate number.`)
        }
        const candidate = Number(token)
        if (candidate < 1 || candidate > candidateCount) {
            throw new BltError(`Line ${line}: there is no candidate ${candidate}.`)
        }

        return candidate - 1
    }

    let line = nextLine()
    const withdrawn = new Set<number>()
    if (line?.text.startsWith('-')) {
        for (const token of line.text.split(/[ \t]+/)) {
            withdrawn.add(candidateNumber(token.slice(1), line.number))
        }
        line = nextLine()
    }

    const ballots: number[][] = []
    let preferenceCount = 0
    for (; line?.text !== '0'; line = nextLine()) {
        if (line === undefined) {
            throw new BltError('The .blt file has no 0 line after the ballots.')
        }
        if (line.text.includes('=')) {
            throw new BltError(`Line ${line.number}: equal rankings (=) can't be counted; each preference needs its own number.`)
        }

        const unlabelled = line.text.startsWith('(') ? asciiTrim(line.text.slice(line.text.indexOf(')') + 1)) : line.text
        const tokens = unlabelled.split(/[ \t]+/)
        const weight = /^\d+(\.0+)?$/.test(tokens[0]!) ? Number(tokens[0]) : 0
        if (weight < 1) {
            throw new BltError(`Line ${line.number}: the weight should be a whole number of at least 1.`)
        }
        if (tokens.at(-1) !== '0') {
            throw new BltError(`Line ${line.number}: a ballot line should end with 0.`)
        }
        const preferences = tokens.slice(1, -1).map(token => candidateNumber(token, line!.number))
        if (ballots.length + weight > MOST_BALLOTS) {
            throw new BltError('The .blt file holds more than 1,000,000 ballots.')
        }
        preferenceCount += weight * preferences.length
        if (preferenceCount > MOST_PREFERENCES) {
            throw new BltError('The .blt file holds more than 20,000,000 preferences in all.')
        }
        for (let i = 0; i < weight; i++) {
            ballots.push([...preferences])
        }
    }

    const names = [...raw.slice(at).join('\n').matchAll(/"([^"]*)"/g)].map(match => match[1]!)
    if (names.length < candidateCount + 1) {
        throw new BltError(`After the ballots, a .blt file should list ${candidateCount} candidate names and a title, each in quotes.`)
    }

    const kept = names.slice(0, candidateCount).flatMap((_, i) => (withdrawn.has(i) ? [] : [i]))
    const renumbered: number[] = []
    kept.forEach((original, i) => (renumbered[original] = i))

    return {
        title: names[candidateCount]!,
        seats,
        candidates: kept.map(i => names[i]!),
        ballots: ballots.map(ballot => ballot.filter(c => !withdrawn.has(c)).map(c => renumbered[c]!)),
    }
}

/** Curly quotes for straight ones, which the format can't hold inside a name. */
function quoted(s: string): string {
    let opening = true

    return `"${s.replace(/"/g, () => {
        const mark = opening ? '“' : '”'
        opening = !opening

        return mark
    })}"`
}

/** Writes a question's formal ballots as .blt, identical ballots grouped under one weight. */
export function toBlt(q: ElectionQuestion): string {
    const ballots = q.ballots
        .filter(ballot => isFormal(q, ballot))
        .map(ballot => (q.method === 'plurality' ? [...ballot].sort((a, b) => a - b) : ballot))
        .sort(compareLists)

    const lines = [`${q.candidates.length} ${q.seats}`]
    for (let i = 0; i < ballots.length; ) {
        let weight = 1
        while (i + weight < ballots.length && compareLists(ballots[i + weight]!, ballots[i]!) === 0) {
            weight++
        }
        lines.push(`${weight} ${ballots[i]!.map(c => c + 1).join(' ')} 0`)
        i += weight
    }
    lines.push('0', ...q.candidates.map(quoted), quoted(q.title), '')

    return lines.join('\n')
}
