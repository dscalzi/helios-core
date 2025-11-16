import { fileURLToPath } from 'url'
import { platform } from 'os'

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

export function ensureEncodedPath(path: string): string {
    // ## BACKWARD COMPATIBILITY FIX ##
    // To avoid the `ENOENT` error, we now return a path with normalized
    // forward slashes instead of a URI string.
    return path.replace(/\\/g, '/')
}

export function ensureDecodedPath(path: string): string {
    if (path.startsWith('file://')) {
        try {
            return fileURLToPath(path)
        } catch (e) {
            // Fallback for non-standard file URIs.
            const strippedPath = path.substring(path.startsWith('file:///') ? 8 : 7)
            if (platform() === 'win32') {
                // Return as is if it's a POSIX-like absolute path.
                if (strippedPath.startsWith('/')) return strippedPath
                return strippedPath.replace(/\//g, '\\')
            }
            return strippedPath
        }
    }

    if (platform() === 'win32') {
        // On Windows, do NOT convert slashes for POSIX-style absolute paths.
        // This is to prevent `/Users/test` from becoming `\Users\test`.
        if (path.startsWith('/')) {
            return path
        }
        // Convert for relative paths or Windows paths using forward slashes.
        return path.replace(/\//g, '\\')
    }

    return path
}
