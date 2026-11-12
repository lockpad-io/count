import { BallotFileError, parseBallotFile } from './ballot-file.ts'
import { countFile } from './count.ts'

/**
 * The CLI without its I/O: a ballot file's JSON in, the count's JSON out with exit code 0, or
 * `{"error": message}` with exit code 2 when the file can't be read.
 */
export function runCli(stdin: string): { stdout: string; exitCode: number } {
    try {
        return { stdout: `${JSON.stringify(countFile(parseBallotFile(stdin)))}\n`, exitCode: 0 }
    } catch (error) {
        if (error instanceof BallotFileError) {
            return { stdout: `${JSON.stringify({ error: error.message })}\n`, exitCode: 2 }
        }
        throw error
    }
}
