import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { getServerStatus, ServerStatus } from '../../../lib/mojang/net/ServerStatusAPI'

chai.use(chaiAsPromised)

describe('[Server Status API] Errors', () => {

    it('Server Status (Not Found)', async () => {

        await expect(getServerStatus(47, 'a', 25565)).to.eventually.be.rejectedWith(Error)

    }).timeout(7000)

    it('Server Status (Wrong Port)', async () => {

        await expect(getServerStatus(47, 'mc.westeroscraft.com', 34454)).to.be.rejectedWith(Error)

    }).timeout(7000)

})

function verifyResult(res: ServerStatus): void {
    expect(res).to.not.be.null
    expect(res).to.be.an('object')
    expect(res).to.have.property('version')
    expect(res).to.have.property('players')
    expect(res).to.have.property('description')
    expect(res.players).to.be.an('object')
    expect(res.players).to.have.property('max')
    expect(res.players).to.have.property('online')
    expect(res.description).to.be.an('object')
    expect(res.description).to.have.property('text')
}

const serversToCheck: [string, number?][] = [
    ['mc.hypixel.net'],
    ['mc.westeroscraft.com', 1182],
    // 'stoneblock.colaian.tech' // SRV - commented out b/c may be shut down.
]

describe('[Server Status API] Server Status', () => {

    for(const [server, port] of serversToCheck) {
        it(`Server Status (${server})`, async () => {

            verifyResult(await getServerStatus(47, server, port))
    
        }).timeout(5000)
    }

})