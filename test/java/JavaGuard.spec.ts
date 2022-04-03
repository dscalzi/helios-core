import { expect } from 'chai'
import nock from 'nock'
import { AdoptiumJdk, latestOpenJDK } from '../../lib/java/JavaGuard'

import adoptium8 from './assets/adoptium_8.json'
import adoptium17 from './assets/adoptium_17.json'
import { JdkDistribution } from 'helios-distribution-types'

describe('[JavaGuard] General', () => {

    after(() => {
        nock.cleanAll()
    })

    const ADOPTIUM_ENDPOINT = 'https://api.adoptium.net'

    it('Latest JDK 8 (TEMURIN)', async () => {

        nock(ADOPTIUM_ENDPOINT)
            .get('/v3/assets/latest/8/hotspot?vendor=eclipse')
            .reply(200, (): AdoptiumJdk[] => adoptium8 as AdoptiumJdk[])

        const res = await latestOpenJDK(8, JdkDistribution.TEMURIN)
        expect(res).to.not.be.null

    })

    it('Latest JDK 17 (TEMURIN)', async () => {

        nock(ADOPTIUM_ENDPOINT)
            .get('/v3/assets/latest/17/hotspot?vendor=eclipse')
            .reply(200, (): AdoptiumJdk[] => adoptium17 as AdoptiumJdk[])

        const res = await latestOpenJDK(17, JdkDistribution.TEMURIN)
        expect(res).to.not.be.null

    })

    it('Latest JDK 8 (CORRETTO)', async () => {
        const res = await latestOpenJDK(8, JdkDistribution.CORRETTO)
        expect(res).to.not.be.null
    })

    it('Latest JDK 17 (CORRETTO)', async () => {
        const res = await latestOpenJDK(17, JdkDistribution.CORRETTO)
        expect(res).to.not.be.null
    })

})