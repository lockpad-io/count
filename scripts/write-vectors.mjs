// Writes vectors/ from the hand-checked and published cases in test/. Each vector is a ballot
// file in canonical form and the exact output countFile gives for it. Run this only after a
// deliberate change to a counting rule, and review every changed line before committing:
// the vectors are what keep the engine from changing a result by accident.
//
// Usage: npm run build && node scripts/write-vectors.mjs
import { readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { NOTICE_TEXT, ENGINE_VERSION, canonicalJson, countFile, ballotsHash, drawCandidate } from '../dist/lockpad-count.mjs'

const root = new URL('..', import.meta.url)
const times = (n, ballot) => Array.from({ length: n }, () => [...ballot])
const [A, B, C, D, E, F] = [0, 1, 2, 3, 4, 5]
const letters = n => ['A', 'B', 'C', 'D', 'E', 'F'].slice(0, n)

const election = (id, method, seats, candidates, ballots, tieDecisions = [], title = id) => ({
    id, kind: 'election', title, method, seats, candidates, minPreferences: 1, ballots, tieDecisions,
})
const resolution = (id, ballots, threshold, base) => ({
    id, kind: 'resolution', title: id, motion: 'Adopt the new rules', threshold, base, ballots,
})
const file = (title, questions) => ({
    format: 'lockpad-ballots', version: 1, engine: ENGINE_VERSION, title, notice: NOTICE_TEXT, questions,
})
const answers = (f, a, x) => [...Array(f).fill('for'), ...Array(a).fill('against'), ...Array(x).fill('abstain')]

const irvTie = [...times(3, [A]), ...times(2, [B]), ...times(2, [C])]
const irvTieFile = file('IRV tie settled by the seeded draw', [election('president', 'irv', 1, letters(3), irvTie)])
const drawn = drawCandidate(ballotsHash(irvTieFile), 'president', 2, 'exclude', 'kookaburra', [B, C])

const shetland = JSON.parse(readFileSync(new URL('test/fixtures/shetland-central-2022.json', root), 'utf8'))

const vectors = {
    'plurality-block': file('Block plurality, 2 seats', [
        election('committee', 'plurality', 2, letters(4), [...times(3, [A, B]), ...times(2, [A, C]), [B, D], [C]]),
    ]),
    'plurality-tie-decision': file('Block plurality, a boundary tie settled by decision', [
        election('committee', 'plurality', 2, letters(4), [...times(2, [A, B]), ...times(2, [A, C])], [
            { round: 1, kind: 'elect', tied: [B, C], chosen: C, how: 'entered' },
        ]),
    ]),
    'plurality-three-way': file('Block plurality, three tied for two seats', [
        election('committee', 'plurality', 2, letters(3), [[A], [B], [C]], [
            { round: 1, kind: 'elect', tied: [A, B, C], chosen: B, how: 'entered' },
            { round: 1, kind: 'elect', tied: [A, C], chosen: C, how: 'entered' },
        ]),
    ]),
    'resolutions': file('Resolutions: three bases and a simple majority', [
        resolution('for-against', answers(15, 4, 1), { rule: 'at-least', numerator: 3, denominator: 4 }, 'for-against'),
        resolution('all-ballots', answers(15, 4, 1), { rule: 'at-least', numerator: 3, denominator: 4 }, 'all-ballots'),
        resolution('fixed', answers(15, 4, 1), { rule: 'at-least', numerator: 3, denominator: 4 }, { fixed: 21 }),
        resolution('even', answers(10, 10, 0), { rule: 'more-than', numerator: 1, denominator: 2 }, 'for-against'),
        resolution('no-base', answers(0, 0, 3), { rule: 'at-least', numerator: 3, denominator: 4 }, 'for-against'),
    ]),
    'irv-majority': file('Instant runoff, a majority after one exclusion', [
        election('president', 'irv', 1, letters(3), [...times(4, [A, B, C]), ...times(3, [B, C, A]), ...times(2, [C, B, A])]),
    ]),
    'irv-optional': file('Instant runoff, optional preferences exhaust', [
        election('president', 'irv', 1, letters(3), [...times(4, [A]), ...times(3, [B]), ...times(2, [C])]),
    ]),
    'irv-countback': file('Instant runoff, an exclusion tie broken by countback', [
        election('president', 'irv', 1, letters(4), [...times(6, [A]), ...times(5, [B]), ...times(3, [C]), ...times(2, [D, C])]),
    ]),
    'irv-drawn-decision': {
        ...irvTieFile,
        questions: [{ ...irvTieFile.questions[0], tieDecisions: [{ round: 2, kind: 'exclude', tied: [B, C], chosen: drawn, how: 'draw', witnessValue: 'kookaburra' }] }],
    },
    'stv-17-ballots': file('STV, 17 ballots, 2 seats', [
        election('committee', 'stv-wigm', 2, letters(4), [...times(6, [A, B, C]), ...times(2, [A, C]), ...times(4, [B]), ...times(3, [C, D]), [D, C], [D]]),
    ]),
    'stv-truncation': file('STV, a transfer value of one third', [
        election('committee', 'stv-wigm', 2, letters(3), [...times(2, [A, B]), [A, C]]),
    ]),
    'stv-mixed-weights': file('STV, a surplus made of ballots of different weights', [
        election('committee', 'stv-wigm', 3, letters(5), [...times(10, [A, B, D]), ...times(3, [B, C]), ...times(3, [C]), ...times(3, [D]), ...times(2, [E, D])]),
    ]),
    'stv-per-ballot-truncation': file('STV, surplus × weight ÷ total truncated once per ballot', [
        election('committee', 'stv-wigm', 3, letters(5), [...times(8, [A, B, D]), ...times(3, [B, C]), [C], ...times(2, [D]), ...times(3, [E, D])]),
    ]),
    'stv-equal-surpluses': file('STV, equal surpluses ordered by countback', [
        election('committee', 'stv-wigm', 4, letters(6), [...times(4, [A, B]), ...times(6, [A, C]), ...times(4, [B]), ...times(3, [C]), ...times(3, [D]), ...times(2, [E]), [F]]),
    ]),
    'stv-surplus-order-decision': file('STV, equal surpluses on the first count settled by decision', [
        election('committee', 'stv-wigm', 3, letters(5), [...times(7, [A, C]), ...times(7, [B, D]), [C], [D], [E]], [
            { round: 2, kind: 'surplus-order', tied: [A, B], chosen: B, how: 'entered' },
        ]),
    ]),
    'edge-no-formal-and-uncontested': file('No formal ballots, and uncontested elections', [
        election('plurality-none', 'plurality', 2, letters(4), [[], [A, B, C], [7]]),
        election('irv-none', 'irv', 1, letters(3), [[], [A, A]]),
        election('stv-none', 'stv-wigm', 2, letters(4), [[], [9]]),
        election('stv-uncontested', 'stv-wigm', 3, letters(3), [[A], [B], [C]]),
        election('plurality-uncontested', 'plurality', 2, letters(2), []),
    ]),
    'stv-shetland-central-2022': file(`${shetland.title}. Ballots: ${shetland.sources.ballots} Result: ${shetland.sources.result}`, [
        election('ward-4', 'stv-wigm', shetland.seats, shetland.candidates,
            shetland.weightedBallots.flatMap(([weight, ...prefs]) => times(weight, prefs.map(p => p - 1))), [], 'Ward 4 Shetland Central'),
    ]),
}

const directory = new URL('vectors/', root)
rmSync(directory, { recursive: true, force: true })
mkdirSync(directory)
for (const [name, ballotFile] of Object.entries(vectors)) {
    const output = countFile(ballotFile)
    writeFileSync(new URL(`${name}.json`, directory), `{"file":${canonicalJson(ballotFile)},\n"output":${JSON.stringify(output, null, 2)}}\n`)
}
console.log(`wrote ${Object.keys(vectors).length} vectors`)
