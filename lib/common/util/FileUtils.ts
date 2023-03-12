import { createHash } from 'crypto'
import { join } from 'path'
import { pathExists, createReadStream } from 'fs-extra'
import { LoggerUtil } from '../..//util/LoggerUtil'

const log = LoggerUtil.getLogger('FileUtils')

export function calculateHashByBuffer(buf: Buffer, algo: string): string {
    return createHash(algo).update(buf).digest('hex')
}

export function calculateHash(path: string, algo: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = createHash(algo)
        const input = createReadStream(path)

        input.on('error', reject)
        input.on('data', chunk => hash.update(chunk))
        input.on('close', () => resolve(hash.digest('hex')))
    })
}

export async function validateLocalFile(path: string, algo: string, hash?: string): Promise<boolean> {
    if(await pathExists(path)) {
        if(hash == null) {
            return true
        }
        
        try {
            return (await calculateHash(path, algo)) === hash
        } catch(err) {
            log.error('Failed to calculate hash.', err)
        }
    }
    return false
}

function getVersionExtPath(commonDir: string, version: string, ext: string): string {
    return join(commonDir, 'versions', version, `${version}.${ext}`)
}

export function getVersionJsonPath(commonDir: string, version: string): string {
    return getVersionExtPath(commonDir, version, 'json')
}

export function getVersionJarPath(commonDir: string, version: string): string {
    return getVersionExtPath(commonDir, version, 'jar')
}

export function getLibraryDir(commonDir: string): string {
    return join(commonDir, 'libraries')
}