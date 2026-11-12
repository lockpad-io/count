const isAsciiWhitespace = (code: number) => code === 0x20 || code === 0x09 || code === 0x0d || code === 0x0a

/**
 * Trims spaces, tabs, CRs and LFs only, so every engine trims the same characters. Two index
 * scans, not a regex, so a long run of whitespace in an uploaded file can't stall the page.
 */
export function asciiTrim(s: string): string {
    let start = 0
    let end = s.length
    while (start < end && isAsciiWhitespace(s.charCodeAt(start))) {
        start++
    }
    while (end > start && isAsciiWhitespace(s.charCodeAt(end - 1))) {
        end--
    }

    return s.slice(start, end)
}

/** Orders two lists of numbers element by element, a shorter prefix first. */
export function compareLists(a: readonly number[], b: readonly number[]): number {
    const length = Math.min(a.length, b.length)
    for (let i = 0; i < length; i++) {
        if (a[i]! !== b[i]!) {
            return a[i]! < b[i]! ? -1 : 1
        }
    }

    return a.length - b.length
}

/** Orders two strings by UTF-16 code units, never by locale. */
export function compareText(a: string, b: string): number {
    if (a === b) {
        return 0
    }

    return a < b ? -1 : 1
}
