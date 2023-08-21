import { ChildProcess, fork, ForkOptions } from 'child_process'
import { join } from 'path'
import { DownloadTransmission, FullRepairReply, ValidateTransmission } from './receivers/FullRepairReceiver'
import { LoggerUtil } from '../util/LoggerUtil'

const log = LoggerUtil.getLogger('Transmitter')

abstract class BaseTransmitter {
    
    protected receiver!: ChildProcess

    public spawnReceiver(additionalEnvVars?: NodeJS.ProcessEnv): void {

        if (this.receiver != null) {
            throw new Error('Receiver already spawned!')
        }

        const forkOptions: ForkOptions = {
            stdio: 'pipe'
        }

        if(additionalEnvVars) {
            // Copy and enrich current env
            const forkEnv: NodeJS.ProcessEnv = {
                ...JSON.parse(JSON.stringify(process.env)) as NodeJS.ProcessEnv,
                ...additionalEnvVars
            }

            forkOptions.env = forkEnv
        }

        this.receiver = fork(join(__dirname, 'receivers', 'ReceiverExecutor.js'), [ this.receiverName() ], forkOptions)

        // Stdout
        this.receiver.stdio[1]!.setEncoding('utf8')
        this.receiver.stdio[1]!.on('data', (data: string) => {
            `${data}`.trim().split('\n')
                .forEach(line => console.log(`\x1b[32m[_]\x1b[0m ${line}`))
            
        })
        // Stderr
        this.receiver.stdio[2]!.setEncoding('utf8')
        this.receiver.stdio[2]!.on('data', (data: string) => {
            `${data}`.trim().split('\n')
                .forEach(line => console.log(`\x1b[31m[_]\x1b[0m ${line}`))
        })
    }

    abstract receiverName(): string

    public destroyReceiver(): void {
        this.receiver.disconnect()
        this.receiver = null!
    }

    get childProcess(): ChildProcess {
        return this.receiver
    }

}

export class FullRepair extends BaseTransmitter {

    constructor(
        private commonDirectory: string,
        private instanceDirectory: string,
        private launcherDirectory: string,
        private serverId: string,
        private devMode: boolean
    ) {
        super()
    }

    receiverName(): string {
        return 'FullRepairReceiver'
    }

    public verifyFiles(onProgress: (percent: number) => void): Promise<number> {

        return new Promise<number>((resolve, reject) => {

            const onMessageHandle = (message: FullRepairReply): void => {

                switch(message.response) {
                    case 'validateProgress':
                        log.debug('Received validate progress ' + message.percent)
                        onProgress(message.percent)
                        break
                    case 'validateComplete':
                        log.info('Received validation complete.')
                        this.receiver.removeListener('message', onMessageHandle)
                        resolve(message.invalidCount)
                        break
                    case 'error':
                        log.error('Received error.')
                        this.receiver.disconnect()
                        reject(message)
                        break
                }
                
            }

            this.receiver.on('message', onMessageHandle)
    
            this.receiver.send({
                action: 'validate',
                commonDirectory: this.commonDirectory,
                instanceDirectory: this.instanceDirectory,
                launcherDirectory: this.launcherDirectory,
                serverId: this.serverId,
                devMode: this.devMode
            } as ValidateTransmission)
        })

    }

    public download(onProgress: (percent: number) => void): Promise<void> {

        return new Promise<void>((resolve, reject) => {
            
            const onMessageHandle = (message: FullRepairReply): void => {

                switch(message.response) {
                    case 'downloadProgress':
                        log.debug('Received download progress ' + message.percent)
                        onProgress(message.percent)
                        break
                    case 'downloadComplete':
                        log.info('Received download complete.')
                        this.receiver.removeListener('message', onMessageHandle)
                        resolve()
                        break
                    case 'error':
                        log.error('Received error.')
                        this.receiver.disconnect()
                        reject(message)
                        break
                }
            }

            this.receiver.on('message', onMessageHandle)

            this.receiver.send({
                action: 'download'
            } as DownloadTransmission)
        })
    }

}