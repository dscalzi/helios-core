import { URL, fileURLToPath } from 'url'

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function ensureEncodedPath(path: string): string {
    return new URL(`file://${path}`).toString()
}

export function ensureDecodedPath(path: string): string {
    if(path.startsWith('file://')) {
        return fileURLToPath(path)
    } else {
        return path
    }
}