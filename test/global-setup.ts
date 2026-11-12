import { execFileSync } from 'node:child_process'

export default function setup(): void {
    execFileSync(process.execPath, ['scripts/build.mjs'], {
        cwd: new URL('..', import.meta.url),
        stdio: 'pipe',
    })
}
