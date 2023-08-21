import { fsyncSync, writeSync } from 'fs'
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
// eslint-disable-next-line @typescript-eslint/no-misused-promises
process.on('message', async message => {
    try {
        await receiver.execute(message)
    } catch(err) {
        log.error('Error During Receiver Operation')
        log.error(err)
        let displayable = undefined
        try {
            log.error('Asking the reciever for more details (if available):')
            displayable = await receiver.parseError(err)
            if (displayable) {
                log.error(`Receiver replied with ${displayable}`)
            } else {
                log.error('The receiver could not parse the error.')
            }
            
        } catch(fixme) {
            log.error('The reciever\'s error parser threw also, this is a bug and should be reported.', fixme)
        }
        // Our winston logger only outputs to stdout, so this works.
        // Write directly to stdout and await stdout flush.
        writeSync(process.stdout.fd, 'Error now being propagated back to the transmitter.')
        fsyncSync(process.stdout.fd)
        process.send!({
            response: 'error',
            displayable

        } as ErrorReply)
        // Current executor behavior is to terminate on first error.
        // In theory, if an unhandled error reaches here the process failed.
        // Errors that should not crash the process should be handled before it gets to this point.
        process.exit(1)
    }
})

// Dump issues to the console.
process.on('unhandledRejection', r => console.log(r))

process.on('disconnect', () => {
    log.info('Disconnect singal received, shutting down.')
    process.exit(0)
})