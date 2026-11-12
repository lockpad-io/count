import { isFormal } from './formality.ts'
import { asciiTrim, compareLists } from './text.ts'
import type { ElectionQuestion, Method } from './types.ts'

/** A CSV file that can't be read as ballots at all. A bad row is rejected, not thrown. */
export class CsvError extends Error {
    override name = 'CsvError'
}

/** One CSV record with its 1-based row number, counting the header as row 1. */
interface Row {
    number: number
    cells: string[]
}

/** RFC 4180: commas, quoted cells with doubled quotes and line breaks, CRLF or LF, a leading BOM. */
function readRows(text: string): Row[] {
    const rows: Row[] = []
    let cells: string[] = []
    let cell = ''
    let quoted = false
    let cellStarted = false
    const endCell = () => {
        cells.push(cell)
        cell = ''
        cellStarted = false
    }
    const endRow = () => {
        endCell()
        rows.push({ number: rows.length + 1, cells })
        cells = []
    }

    const source = text.replace(/^\ufeff/, '')
    for (let i = 0; i < source.length; i++) {
        const ch = source[i]!
        if (quoted) {
            if (ch !== '"') {
                cell += ch
            } else if (source[i + 1] === '"') {
                cell += '"'
                i++
            } else {
                quoted = false
            }
        } else if (ch === '"' && !cellStarted) {
            quoted = true
            cellStarted = true
        } else if (ch === ',') {
            endCell()
        } else if (ch === '\r' || ch === '\n') {
            if (ch === '\r' && source[i + 1] === '\n') {
                i++
            }
            endRow()
        } else {
            cell += ch
            cellStarted = true
        }
    }
    if (quoted) {
        throw new CsvError('The file has a quote that never closes.')
    }
    if (cellStarted || cells.length > 0) {
        endRow()
    }

    return rows
}

const isBlank = (row: Row) => row.cells.every(cell => asciiTrim(cell) === '')

/** How names are compared: NFC, ASCII-trimmed. */
const nameKey = (name: string) => asciiTrim(name.normalize('NFC'))

/**
 * Reads ballots from a spreadsheet. In the `preferences` layout the header names the candidates
 * and each cell holds a preference number (for plurality, any mark but 0, FALSE or no); in `ranked-names` each
 * column is a rank and each cell a candidate's name. Blank rows are skipped. A row that can't be
 * read becomes an informal ballot `[]`, and its row number goes in `rejectedRows`.
 */
export function parseCsv(
    text: string,
    layout: 'preferences' | 'ranked-names',
    method: Method,
    candidates?: string[]
): { candidates: string[]; ballots: number[][]; rejectedRows: number[] } {
    const rows = readRows(text).filter(row => !isBlank(row))
    const header = rows.shift()
    if (header === undefined) {
        throw new CsvError('The file has no header row.')
    }

    const names = candidates === undefined ? [] : [...candidates]
    const indexOf = new Map(names.map((name, i) => [nameKey(name), i]))
    const ballots: number[][] = []
    const rejectedRows: number[] = []
    const reject = (row: Row) => {
        ballots.push([])
        rejectedRows.push(row.number)
    }

    if (layout === 'preferences') {
        // Spreadsheets often export empty columns after the last one in use.
        const headings = [...header.cells]
        while (asciiTrim(headings.at(-1)!) === '') {
            headings.pop()
        }
        const columns = headings.map((cell, i) => {
            const name = asciiTrim(cell)
            if (name === '') {
                throw new CsvError(`Column ${i + 1} has no candidate name.`)
            }
            if (candidates === undefined) {
                if (indexOf.has(nameKey(name))) {
                    throw new CsvError(`"${name}" heads two columns.`)
                }
                indexOf.set(nameKey(name), names.length)
                names.push(name)
            }
            const index = indexOf.get(nameKey(name))
            if (index === undefined) {
                throw new CsvError(`"${name}" isn't one of the candidates.`)
            }

            return index
        })

        for (const row of rows) {
            const ballot = readPreferences(row, columns, method)
            if (ballot === undefined) {
                reject(row)
            } else {
                ballots.push(ballot)
            }
        }
    } else {
        for (const row of rows) {
            const named = row.cells.map(asciiTrim).filter(cell => cell !== '')
            const keys = named.map(nameKey)
            if (new Set(keys).size !== keys.length) {
                reject(row)
                continue
            }
            if (candidates === undefined) {
                for (const [i, key] of keys.entries()) {
                    if (!indexOf.has(key)) {
                        indexOf.set(key, names.length)
                        names.push(named[i]!)
                    }
                }
            }
            const ballot = keys.map(key => indexOf.get(key) ?? -1)
            if (ballot.includes(-1)) {
                reject(row)
            } else {
                ballots.push(ballot)
            }
        }
    }

    return { candidates: names, ballots, rejectedRows }
}

/** A plurality cell that a spreadsheet writes for an unticked box: 0, FALSE or no. */
const UNTICKED = /^(0|false|no)$/i

/** One `preferences` row as a ballot, or undefined when the row can't be read. */
function readPreferences(row: Row, columns: number[], method: Method): number[] | undefined {
    const marks: Array<{ candidate: number; rank: number }> = []
    const ranks = new Set<number>()
    for (const [i, raw] of row.cells.entries()) {
        const cell = asciiTrim(raw)
        if (cell === '' || (method === 'plurality' && UNTICKED.test(cell))) {
            continue
        }
        const candidate = columns[i]
        if (candidate === undefined) {
            return undefined
        }
        if (method === 'plurality') {
            marks.push({ candidate, rank: 0 })
            continue
        }
        if (!/^\d+$/.test(cell) || Number(cell) < 1 || ranks.has(Number(cell))) {
            return undefined
        }
        ranks.add(Number(cell))
        marks.push({ candidate, rank: Number(cell) })
    }

    return marks
        .sort((a, b) => (method === 'plurality' ? a.candidate - b.candidate : a.rank - b.rank))
        .map(m => m.candidate)
}

function csvCell(value: string): string {
    return /[",\r\n]|^[ \t]|[ \t]$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Writes a question's formal ballots as CSV in the `preferences` layout: one column per
 * candidate, a preference number in each cell (X for a plurality vote), CRLF line endings.
 */
export function toCsv(q: ElectionQuestion): string {
    const ballots = q.ballots.filter(ballot => isFormal(q, ballot)).sort(compareLists)
    const lines = [q.candidates.map(csvCell).join(',')]
    for (const ballot of ballots) {
        lines.push(
            q.candidates
                .map((_, c) => {
                    const rank = ballot.indexOf(c)
                    if (rank === -1) {
                        return ''
                    }

                    return q.method === 'plurality' ? 'X' : String(rank + 1)
                })
                .join(',')
        )
    }

    return `${lines.join('\r\n')}\r\n`
}
