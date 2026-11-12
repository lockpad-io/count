import { BallotFileError, ballotsHash, fileHash } from './ballot-file.ts'
import { drawCandidate } from './draw.ts'
import { countIrv } from './irv.ts'
import { countPlurality } from './plurality.ts'
import { countResolution } from './resolution.ts'
import type { ElectionResult, Result } from './results.ts'
import { countStvWigm } from './stv-wigm.ts'
import type { BallotFile, ElectionQuestion, Method, Question } from './types.ts'
import { ENGINE_VERSION } from './version.ts'

const COUNTERS: Record<Method, (q: ElectionQuestion) => ElectionResult> = {
    plurality: countPlurality,
    irv: countIrv,
    'stv-wigm': countStvWigm,
}

/** Counts one question with its own method. */
export function countQuestion(q: Question): Result {
    return q.kind === 'resolution' ? countResolution(q) : COUNTERS[q.method](q)
}

export interface FileCount {
    /** The engine that counted. */
    engine: string
    /** The engine the file was written with. */
    fileEngine: string
    ballotsHash: string
    fileHash: string
    results: Result[]
}

/**
 * Counts every question in a ballot file. Every drawn tie decision is first checked against the
 * seeded draw, so a file can't carry a draw that didn't happen.
 */
export function countFile(file: BallotFile): FileCount {
    const seed = ballotsHash(file)

    file.questions.forEach((q, i) => {
        if (q.kind !== 'election') {
            return
        }
        q.tieDecisions.forEach((d, j) => {
            if (d.how !== 'draw') {
                return
            }
            const drawn = drawCandidate(seed, q.id, d.round, d.kind, d.witnessValue!, d.tied)
            if (drawn !== d.chosen) {
                throw new BallotFileError(
                    `Question ${i + 1} (${q.id}), tie decision ${j + 1}: the draw with "${d.witnessValue!}" picks ${q.candidates[drawn]!}, not ${q.candidates[d.chosen]!}.`
                )
            }
        })
    })

    return {
        engine: ENGINE_VERSION,
        fileEngine: file.engine,
        ballotsHash: seed,
        fileHash: fileHash(file),
        results: file.questions.map(countQuestion),
    }
}
