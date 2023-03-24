import { DistributionAPI } from '../../common/distribution/DistributionAPI'
import { Asset } from '../Asset'
import { DistributionIndexProcessor } from '../distribution/DistributionIndexProcessor'
import { downloadQueue, getExpectedDownloadSize } from '../DownloadEngine'
import { MojangIndexProcessor } from '../mojang/MojangIndexProcessor'
import { ErrorReply, Receiver } from './Receiver'
import { LoggerUtil } from '../../util/LoggerUtil'
import { IndexProcessor } from '../IndexProcessor'
import { validateLocalFile } from '../../common/util/FileUtils'
import { HTTPError, ParseError, ReadError, RequestError, TimeoutError } from 'got'

const log = LoggerUtil.getLogger('FullRepairReceiver')

export type FullRepairTransmission = ValidateTransmission | DownloadTransmission

export interface ValidateTransmission {
    action: 'validate'
    serverId: string
    launcherDirectory: string
    commonDirectory: string
    instanceDirectory: string
    devMode: boolean
}

export interface DownloadTransmission {
    action: 'download'
}

export type FullRepairReply = ValidateProgressReply | ValidateCompleteReply | DownloadProgressReply | DownloadCompleteReply | ErrorReply

export interface ValidateProgressReply {
    response: 'validateProgress'
    percent: number
}

export interface ValidateCompleteReply {
    response: 'validateComplete'
    invalidCount: number
}

export interface DownloadProgressReply {
    response: 'downloadProgress'
    percent: number
}

export interface DownloadCompleteReply {
    response: 'downloadComplete'
}

export class FullRepairReceiver implements Receiver {

    private processors: IndexProcessor[] = []
    private assets: Asset[] = []

    public async execute(message: FullRepairTransmission): Promise<void> {
        
        // Route to the correct function
        switch(message.action) {
            case 'validate':
                await this.validate(message)
                break
            case 'download':
                await this.download(message)
                break
        }

    }

    // Construct friendly error messages
    public async parseError(error: unknown): Promise<string | undefined> {
        if(error instanceof RequestError) {
            if(error?.request?.requestUrl) {
                log.debug(`Error during request to ${error.request.requestUrl}`)
            }

            if(error instanceof HTTPError) {
                log.debug('Response Details:')
                log.debug('Body:', error.response.body)
                log.debug('Headers:', error.response.headers)

                return `Error during request (HTTP Response ${error.response.statusCode})`
            } else if(error.name === 'RequestError') {
                return `Request received no response (${error.code}).`
            } else if(error instanceof TimeoutError) {
                return `Request timed out (${error.timings.phases.total}ms).`
            } else if(error instanceof ParseError) {
                return 'Request received unexepected body (Parse Error).'
            } else if(error instanceof ReadError) {
                return `Read Error (${error.code}): ${error.message}.`
            } else {
                // CacheError, MaxRedirectsError, UnsupportedProtocolError, CancelError
                return 'Error during request.'
            }
        } else {
            return undefined
        }
    }

    public async validate(message: ValidateTransmission): Promise<void> {
        const api = new DistributionAPI(
            message.launcherDirectory,
            message.commonDirectory,
            message.instanceDirectory,
            null!, // The main process must refresh, this is a local pull only.
            message.devMode
        )
    
        const distribution = await api.getDistributionLocalLoadOnly()
        const server = distribution.getServerById(message.serverId)!

        const mojangIndexProcessor = new MojangIndexProcessor(
            message.commonDirectory,
            server.rawServer.minecraftVersion)
        const distributionIndexProcessor = new DistributionIndexProcessor(
            message.commonDirectory,
            distribution,
            message.serverId
        )

        this.processors = [
            mojangIndexProcessor,
            distributionIndexProcessor
        ]
    
        // Init all
        let numStages = 0
        for(const processor of this.processors) {
            await processor.init()
            numStages += processor.totalStages()
        }
    
        const assets: Asset[] = []
        // Validate
        let completedStages = 0
        for(const processor of this.processors) {
            Object.values(await processor.validate(async () => {
                completedStages++
                process.send!({ response: 'validateProgress', percent: Math.trunc((completedStages/numStages)*100) } as ValidateProgressReply)
            }))
                .flatMap(asset => asset)
                .forEach(asset => assets.push(asset))
        }

        this.assets = assets
        process.send!({ response: 'validateComplete', invalidCount: this.assets.length } as ValidateCompleteReply)
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public async download(_message: DownloadTransmission): Promise<void> {
        const expectedTotalSize = getExpectedDownloadSize(this.assets)
    
        log.debug('Expected download size ' + expectedTotalSize)
        this.assets.forEach(({ id }) => log.debug(`Asset Requires Download: ${id}`))

        // Reduce load on IPC channel by sending only whole numbers.
        let currentPercent = 0
        const receivedEach = await downloadQueue(this.assets, received => {
            const nextPercent = Math.trunc((received/expectedTotalSize)*100)
            if(currentPercent !== nextPercent) {
                currentPercent = nextPercent
                process.send!({ response: 'downloadProgress', percent: currentPercent } as DownloadProgressReply)
            }
        })

        for(const asset of this.assets) {
            if(asset.size !== receivedEach[asset.id]) {
                log.warn(`Asset ${asset.id} declared a size of ${asset.size} bytes, but ${receivedEach[asset.id]} were received!`)
                if(!await validateLocalFile(asset.path, asset.algo, asset.hash)) {
                    log.error(`Hashes do not match, ${asset.id} may be corrupted.`)
                }
            }
        }

        for(const processor of this.processors) {
            await processor.postDownload()
        }

        process.send!({ response: 'downloadComplete' } as DownloadCompleteReply)
    }

}