import { createWriteStream } from 'fs'
import got, { Progress } from 'got'
import { pipeline } from 'stream/promises'
import { Asset } from './Asset'
import * as fastq from 'fastq'
import type { queueAsPromised } from 'fastq'
import { ensureDir } from 'fs-extra'
import { dirname } from 'path'

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

    const q: queueAsPromised<Asset, void> = fastq.promise(wrap, 5)

    const promises: Promise<void>[] = assets.map(asset => q.push(asset)).reduce((acc, p) => ([...acc, p]), ([] as Promise<void>[]))
    await Promise.all(promises)

    return receivedTotals
}

export async function downloadFile(url: string, path: string, onProgress?: (progress: Progress) => void): Promise<void> {

    await ensureDir(dirname(path))
    const downloadStream = got.stream(url)
    const fileWriterStream = createWriteStream(path)

    if(onProgress) {
        downloadStream.on('downloadProgress', progress => onProgress(progress))
    }

    await pipeline(downloadStream, fileWriterStream)

}