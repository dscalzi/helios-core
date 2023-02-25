import { LoggerUtil } from '../../util/LoggerUtil'
import { FullRepairReceiver } from './FullRepairReceiver'
import { ErrorReply, Receiver } from './Receiver'

const log = LoggerUtil.getLogger('ReceiverExecutor')
log.info('Receiver process started.')

const manifest: Record<string, () => Receiver> = {
    FullRepairReceiver: () => new FullRepairReceiver()
}

const targetReceiver = process.argv[2]
if(!Object.prototype.hasOwnProperty.call(manifest, targetReceiver)) {
    log.error(`Unknown receiver '${targetReceiver}', shutting down..`)
    process.exit(1)
}

const receiver = manifest[targetReceiver]()
process.on('message', async message => {
    try {
        await receiver.execute(message)
    } catch(err) {
        log.error(err)
        process.send!({ response: 'error' } as ErrorReply)
        process.exit(1)
    }
})

// Dump issues to the console.
process.on('unhandledRejection', r => console.log(r))

process.on('disconnect', () => {
    log.info('Disconnect singal received, shutting down.')
    process.exit(0)
})