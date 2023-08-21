import { createWriteStream, WriteStream } from 'fs'
import got, { Progress, ReadError, RequestError } from 'got'
import { pipeline } from 'stream/promises'
import { Asset } from './Asset'
import * as fastq from 'fastq'
import type { queueAsPromised } from 'fastq'
import { ensureDir } from 'fs-extra'
import { dirname } from 'path'
import { LoggerUtil } from '../util/LoggerUtil'
import { sleep } from '../util/NodeUtil'

const log = LoggerUtil.getLogger('DownloadEngine')

export function getExpectedDownloadSize(assets: Asset[]): number {
    return assets.map(({ size }) => size).reduce((acc, v) => acc + v, 0)
}

export async function downloadQueue(assets: Asset[], onProgress: (received: number) => void): Promise<{ [id: string]: number }> {

    const receivedTotals: { [id: string]: number } = assets.map(({ id }) => id).reduce((acc, id) => ({ ...acc, [id]: 0}), ({}))

    let received = 0

    const onEachProgress = (asset: Asset): (progress: Progress) => void => {
        return ({ transferred }: Progress): void => {
            received += (transferred - receivedTotals[asset.id])
            receivedTotals[asset.id] = transferred
            onProgress(received)
        }
    }

    const wrap = (asset: Asset): Promise<void> => downloadFile(asset.url, asset.path, onEachProgress(asset))

    const q: queueAsPromised<Asset, void> = fastq.promise(wrap, 15)

    const promises: Promise<void>[] = assets.map(asset => q.push(asset)).reduce((acc, p) => ([...acc, p]), ([] as Promise<void>[]))
    await Promise.all(promises)

    return receivedTotals
}

export async function downloadFile(url: string, path: string, onProgress?: (progress: Progress) => void): Promise<void> {

    await ensureDir(dirname(path))


    const MAX_RETRIES = 10
    let fileWriterStream: WriteStream = null!       // The write stream.
    let retryCount = 0                              // The number of retries attempted.
    let error: Error = null!                        // The caught error.
    let retry = false                               // Should we retry.
    let rethrow = false                             // Should we throw an error.

    // Got's streaming retry API is nonexistant and their "example" is egregious.
    // To use their "api" you need to commit yourself to recursive callback hell.
    // No thank you, I prefer this simpler, non error-prone logic.
    do {

        retry = false
        rethrow = false

        if(retryCount > 0) {
            log.debug(`Retry attempt #${retryCount} for ${url}.`)
        }

        try {
            const downloadStream = got.stream(url)

            fileWriterStream = createWriteStream(path)

            if(onProgress) {
                downloadStream.on('downloadProgress', (progress: Progress) => onProgress(progress))
            }

            await pipeline(downloadStream, fileWriterStream)

        } catch(err) {
            error = err as Error
            retryCount++
            rethrow = true

            // For now, only retry timeouts.
            retry = retryCount <= MAX_RETRIES && retryableError(error)

            if(fileWriterStream) {
                fileWriterStream.destroy()
            }

            if(onProgress && retry) {
                // Reset progress on this asset. since we're going to retry.
                onProgress({ transferred: 0, percent: 0, total: 0 })
            }

            if(retry) {
                // Wait one second before retrying.
                // This can become an exponential backoff, but I see no need for that right now.
                await sleep(1000)
            }
        }

    } while(retry)

    if(rethrow && error) {
        if(retryCount > MAX_RETRIES) {
            log.error(`Maximum retries attempted for ${url}. Rethrowing exception.`)
        } else {
            log.error(`Unknown or unretryable exception thrown during request to ${url}. Rethrowing exception.`)
        }
        
        throw error
    }

}

function retryableError(error: Error): boolean {
    if(error instanceof RequestError) {
        // error.name === 'RequestError' means server did not respond.
        return error.name === 'RequestError' || error instanceof ReadError && error.code === 'ECONNRESET'
    } else {
        return false
    }
}