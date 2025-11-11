import got, { Progress, RequestError } from 'got'
import { Asset } from './Asset'
import * as fastq from 'fastq'
import type { queueAsPromised } from 'fastq'
import { ensureDir, pathExists, remove, writeFile } from 'fs-extra'
import { dirname, extname } from 'path'
import { FileValidationError } from '../common/error/FileValidationError'
import { LoggerUtil } from '../util/LoggerUtil'
import { sleep } from '../util/NodeUtil'
import { validateLocalFile } from '../common/util/FileUtils'

const log = LoggerUtil.getLogger('DownloadEngine')

export function getExpectedDownloadSize(assets: Asset[]): number {
    return assets.map(({ size }) => size).reduce((acc, v) => acc + v, 0)
}

export async function downloadQueue(assets: Asset[], onProgress: (received: number) => void): Promise<{ [id: string]: number }> {

    const receivedTotals: { [id: string]: number } = assets.map(({ id }) => id).reduce((acc, id) => ({ ...acc, [id]: 0 }), ({}))

    let received = 0

    const onEachProgress = (asset: Asset): (progress: Progress) => void => {
        return ({ transferred }: Progress): void => {
            received += (transferred - receivedTotals[asset.id])
            receivedTotals[asset.id] = transferred
            onProgress(received)
        }
    }

    const wrap = (asset: Asset): Promise<void> => downloadFile(
        asset,
        onEachProgress(asset)
    )

    const q: queueAsPromised<Asset, void> = fastq.promise(wrap, 15)

    const promises: Promise<void>[] = assets.map(asset => q.push(asset)).reduce((acc, p) => ([...acc, p]), ([] as Promise<void>[]))
    await Promise.all(promises)

    return receivedTotals
}

async function validateFile(path: string, algo: string, hash: string): Promise<boolean> {
    try {
        return await validateLocalFile(path, algo, hash)
    } catch (err) {
        log.error(`Error during file validation: ${path}`, err)
        return false
    }
}

export async function downloadFile(asset: Asset, onProgress?: (progress: Progress) => void): Promise<void> {
    const { url, path, algo, hash } = asset

    const CONFIG_EXTENSIONS = ['.txt', '.json', '.yml', '.yaml', '.dat']
    if (CONFIG_EXTENSIONS.includes(extname(path)) && await pathExists(path)) {
        log.debug(`Skipping download of ${path} as it already exists.`)
        return
    }

    await ensureDir(dirname(path))

    if (await validateFile(path, algo, hash)) {
        log.debug(`File already exists and is valid: ${path}`)
        return
    }

    const MAX_RETRIES = 10
    let retryCount = 0
    let error: Error = null!
    let rethrow = false

    do {
        if (retryCount > 0) {
            const delay = Math.pow(2, retryCount) * 1000
            log.debug(`Retry attempt #${retryCount} for ${url}. Waiting ${delay}ms...`)
            await sleep(delay)
        }

        try {
            const download = got(url, {
                timeout: {
                    request: 15000,
                    connect: 5000
                },
                retry: 0,
                responseType: 'buffer'
            })

            if (onProgress) {
                download.on('downloadProgress', onProgress)
            }

            const body = await download.buffer()
            await writeFile(path, body)

            if (await validateFile(path, algo, hash)) {
                return
            } else {
                throw new FileValidationError(`File validation failed: ${path}`)
            }

        } catch (err) {
            error = err as Error
            retryCount++
            rethrow = true

            if (!(error instanceof FileValidationError)) {
                await remove(path)
            }

            if (onProgress) {
                onProgress({ transferred: 0, percent: 0, total: 0 })
            }

            if (retryCount > MAX_RETRIES || !retryableError(error)) {
                log.error(`Download failed for ${url}. Rethrowing exception.`, error)
                throw error
            }
        }

    } while (retryCount <= MAX_RETRIES)

    if (rethrow && error) {
        log.error(`Maximum retries attempted or unretryable error for ${url}. Rethrowing exception.`)
        throw error
    }
}

function retryableError(error: Error): boolean {
    if (error instanceof RequestError) {
        if (error.response) {
            return error.response.statusCode >= 500 && error.response.statusCode < 600
        }
        return ['ETIMEDOUT', 'ECONNRESET', 'EADDRINUSE', 'ECONNREFUSED', 'ENOTFOUND', 'ERR_GOT_REQUEST_ERROR'].includes(error.code!)
    }
    return false
}
