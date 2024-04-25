/* eslint-disable @typescript-eslint/no-explicit-any */
import { AuthPayload, MojangRestAPI, Session } from '../../../lib/mojang/rest/MojangRestAPI'
import { expect } from 'chai'
import nock from 'nock'
import { MojangErrorCode, MojangResponse } from '../../../lib/mojang/rest/MojangResponse'
import { assertResponse, expectFailure, expectSuccess } from '../../common/RestResponseUtil'

function expectMojangResponse(res: MojangResponse<unknown>, responseCode: MojangErrorCode, negate = false): void {
    assertResponse(res)
    expect(res).to.have.property('mojangErrorCode')
    if (!negate) {
        expect(res.mojangErrorCode).to.equal(responseCode)
    } else {
        expect(res.mojangErrorCode).to.not.equal(responseCode)
    }
}

describe('[Mojang Rest API] Errors', () => {

    after(() => {
        nock.cleanAll()
    })

    it('Status (Offline)', async () => {

        // eslint-disable-next-line @typescript-eslint/dot-notation
        const defStatusHack = MojangRestAPI['statuses']

        nock(MojangRestAPI.STATUS_ENDPOINT)
            .get('/')
            .reply(500, 'Service temprarily offline.')

        const res = await MojangRestAPI.status()
        expectFailure(res)
        expect(res.data).to.be.an('array')
        expect(res.data).to.deep.equal(defStatusHack)

    }).timeout(2500)

    it('Authenticate (Invalid Credentials)', async () => {

        nock(MojangRestAPI.AUTH_ENDPOINT)
            .post('/authserver/authenticate')
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .reply(403, (uri, requestBody: unknown): { error: string, errorMessage: string } => {
                return {
                    error: 'ForbiddenOperationException',
                    errorMessage: 'Invalid credentials. Invalid username or password.'
                }
            })

        const res = await MojangRestAPI.authenticate('user', 'pass', 'xxx', true)
        expectMojangResponse(res, MojangErrorCode.ERROR_INVALID_CREDENTIALS)
        expect(res.data).to.be.a('null')
        expect(res.error).to.not.be.a('null')

    })
})

describe('[Mojang Rest API] Status', () => {

    it('Status (Online)', async () => {

        // eslint-disable-next-line @typescript-eslint/dot-notation
        const defStatusHack = MojangRestAPI['statuses']

        nock(MojangRestAPI.STATUS_ENDPOINT)
            .get(/.*/)
            .reply(200, summaryResponse)

        const res = await MojangRestAPI.status()
        expectSuccess(res)
        expect(res.data).to.be.an('array')
        expect(res.data).to.deep.equal(defStatusHack)

    }).timeout(2500)

})

describe('[Mojang Rest API] Auth', () => {

    it('Authenticate', async () => {

        nock(MojangRestAPI.AUTH_ENDPOINT)
            .post('/authserver/authenticate')
            .reply(200, (uri, requestBody: AuthPayload): Session => {
                const mockResponse: Session = {
                    accessToken: 'abc',
                    clientToken: requestBody.clientToken!,
                    selectedProfile: {
                        id: 'def',
                        name: 'username'
                    }
                }

                if (requestBody.requestUser) {
                    mockResponse.user = {
                        id: 'def',
                        properties: []
                    }
                }

                return mockResponse
            })

        const res = await MojangRestAPI.authenticate('user', 'pass', 'xxx', true)
        expectSuccess(res)
        expect(res.data!.clientToken).to.equal('xxx')
        expect(res.data).to.have.property('user')

    })

    it('Validate', async () => {

        nock(MojangRestAPI.AUTH_ENDPOINT)
            .post('/authserver/validate')
            .times(2)
            .reply((uri, requestBody: any) => {
                return [
                    requestBody.accessToken === 'abc' ? 204 : 403
                ]
            })

        const res = await MojangRestAPI.validate('abc', 'def')

        expectSuccess(res)
        expect(res.data).to.be.a('boolean')
        expect(res.data).to.equal(true)

        const res2 = await MojangRestAPI.validate('def', 'def')

        expectSuccess(res2)
        expect(res2.data).to.be.a('boolean')
        expect(res2.data).to.equal(false)

    })

    it('Invalidate', async () => {

        nock(MojangRestAPI.AUTH_ENDPOINT)
            .post('/authserver/invalidate')
            .reply(204)

        const res = await MojangRestAPI.invalidate('adc', 'def')

        expectSuccess(res)

    })

    it('Refresh', async () => {

        nock(MojangRestAPI.AUTH_ENDPOINT)
            .post('/authserver/refresh')
            .reply(200, (uri, requestBody: any): Session => {
                const mockResponse: Session = {
                    accessToken: 'abc',
                    clientToken: requestBody.clientToken as string,
                    selectedProfile: {
                        id: 'def',
                        name: 'username'
                    }
                }

                if (requestBody.requestUser) {
                    mockResponse.user = {
                        id: 'def',
                        properties: []
                    }
                }

                return mockResponse
            })

        const res = await MojangRestAPI.refresh('gfd', 'xxx', true)
        expectSuccess(res)
        expect(res.data!.clientToken).to.equal('xxx')
        expect(res.data).to.have.property('user')

    })

})

const summaryResponse = [
    {
        name: 'Mojang Multiplayer Session Service',
        url: 'http://session.minecraft.net',
        icon: 'https://icons.duckduckgo.com/ip3/session.minecraft.net.ico',
        slug: 'mojang-multiplayer-session-service',
        status: 'up',
        uptime: '99.94%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '99.94%',
        time: 121,
        timeDay: 27,
        timeWeek: 84,
        timeMonth: 107,
        timeYear: 120,
        dailyMinutesDown: {
            '2022-03-16': 103,
            '2022-01-18': 34
        }
    },
    {
        name: 'Mojang Authserver',
        url: 'https://authserver.mojang.com/',
        icon: 'https://icons.duckduckgo.com/ip3/authserver.mojang.com.ico',
        slug: 'mojang-authserver',
        status: 'up',
        uptime: '99.95%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '99.95%',
        time: 155,
        timeDay: 54,
        timeWeek: 96,
        timeMonth: 146,
        timeYear: 157,
        dailyMinutesDown: {
            '2022-03-16': 102,
            '2021-12-15': 17
        }
    },
    {
        name: 'Minecraft Skins',
        url: 'https://textures.minecraft.net',
        icon: 'https://icons.duckduckgo.com/ip3/textures.minecraft.net.ico',
        slug: 'minecraft-skins',
        status: 'up',
        uptime: '98.83%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '93.66%',
        uptimeYear: '98.83%',
        time: 81,
        timeDay: 77,
        timeWeek: 74,
        timeMonth: 89,
        timeYear: 81,
        dailyMinutesDown: {
            '2022-10-13': 429,
            '2022-10-12': 1440,
            '2022-10-11': 910
        }
    },
    {
        name: 'Mojang\'s Public API',
        url: 'https://api.mojang.com/',
        icon: 'https://icons.duckduckgo.com/ip3/api.mojang.com.ico',
        slug: 'mojang-s-public-api',
        status: 'up',
        uptime: '99.96%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '99.96%',
        time: 133,
        timeDay: 61,
        timeWeek: 85,
        timeMonth: 94,
        timeYear: 133,
        dailyMinutesDown: {
            '2022-03-16': 100
        }
    },
    {
        name: 'Minecraft.net website',
        url: 'https://www.minecraft.net/en-us',
        icon: 'https://icons.duckduckgo.com/ip3/www.minecraft.net.ico',
        slug: 'minecraft-net-website',
        status: 'up',
        uptime: '86.66%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '86.66%',
        time: 514,
        timeDay: 168,
        timeWeek: 749,
        timeMonth: 302,
        timeYear: 508,
        dailyMinutesDown: {
            '2022-05-18': 787,
            '2022-05-17': 1440,
            '2022-05-16': 1440,
            '2022-05-15': 1440,
            '2022-05-14': 1440,
            '2022-05-13': 1440,
            '2022-05-12': 1440,
            '2022-05-11': 1440,
            '2022-05-10': 1440,
            '2022-05-09': 1440,
            '2022-05-08': 1440,
            '2022-05-07': 1440,
            '2022-05-06': 1440,
            '2022-05-05': 1440,
            '2022-05-04': 1440,
            '2022-05-03': 1440,
            '2022-05-02': 1440,
            '2022-05-01': 1440,
            '2022-04-30': 1440,
            '2022-04-29': 1440,
            '2022-04-28': 1440,
            '2022-04-27': 1440,
            '2022-04-26': 403,
            '2022-04-19': 6,
            '2022-04-10': 7,
            '2022-04-05': 65,
            '2022-03-25': 11,
            '2022-03-16': 76,
            '2022-01-27': 17
        }
    },
    {
        name: 'Mojang Accounts Website',
        url: 'https://account.mojang.com/',
        icon: 'https://icons.duckduckgo.com/ip3/account.mojang.com.ico',
        slug: 'mojang-accounts-website',
        status: 'up',
        uptime: '99.95%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '99.95%',
        time: 311,
        timeDay: 97,
        timeWeek: 168,
        timeMonth: 203,
        timeYear: 313,
        dailyMinutesDown: {
            '2022-06-03': 15,
            '2022-04-05': 11,
            '2022-03-16': 89,
            '2022-02-28': 5
        }
    },
    {
        name: 'Microsoft OAuth Server',
        url: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        icon: 'https://icons.duckduckgo.com/ip3/login.microsoftonline.com.ico',
        slug: 'microsoft-o-auth-server',
        status: 'up',
        uptime: '100.00%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '100.00%',
        time: 390,
        timeDay: 637,
        timeWeek: 287,
        timeMonth: 361,
        timeYear: 390,
        dailyMinutesDown: {}
    },
    {
        name: 'Xbox Live auth server',
        url: 'https://user.auth.xboxlive.com/user/authenticate',
        icon: 'https://icons.duckduckgo.com/ip3/user.auth.xboxlive.com.ico',
        slug: 'xbox-live-auth-server',
        status: 'up',
        uptime: '100.00%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '100.00%',
        time: 207,
        timeDay: 170,
        timeWeek: 263,
        timeMonth: 250,
        timeYear: 205,
        dailyMinutesDown: {}
    },
    {
        name: 'Xbox Live Gatekeeper',
        url: 'https://xsts.auth.xboxlive.com/xsts/authorize',
        icon: 'https://icons.duckduckgo.com/ip3/xsts.auth.xboxlive.com.ico',
        slug: 'xbox-live-gatekeeper',
        status: 'up',
        uptime: '100.00%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '100.00%',
        time: 217,
        timeDay: 130,
        timeWeek: 131,
        timeMonth: 138,
        timeYear: 216,
        dailyMinutesDown: {}
    },
    {
        name: 'Microsoft Minecraft API',
        url: 'https://api.minecraftservices.com/authentication/login_with_xbox',
        icon: 'https://icons.duckduckgo.com/ip3/api.minecraftservices.com.ico',
        slug: 'microsoft-minecraft-api',
        status: 'up',
        uptime: '99.88%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '99.88%',
        time: 593,
        timeDay: 164,
        timeWeek: 176,
        timeMonth: 201,
        timeYear: 603,
        dailyMinutesDown: {
            '2022-08-30': 26,
            '2022-07-20': 34,
            '2022-07-09': 7,
            '2022-06-30': 14,
            '2022-06-17': 6,
            '2022-05-19': 23,
            '2022-05-16': 24,
            '2022-04-08': 7,
            '2022-03-27': 29,
            '2022-03-16': 88,
            '2022-01-18': 33
        }
    },
    {
        name: 'Microsoft Minecraft Profile',
        url: 'https://api.minecraftservices.com/minecraft/profile',
        icon: 'https://icons.duckduckgo.com/ip3/api.minecraftservices.com.ico',
        slug: 'microsoft-minecraft-profile',
        status: 'up',
        uptime: '99.93%',
        uptimeDay: '100.00%',
        uptimeWeek: '100.00%',
        uptimeMonth: '100.00%',
        uptimeYear: '99.93%',
        time: 140,
        timeDay: 27,
        timeWeek: 42,
        timeMonth: 48,
        timeYear: 143,
        dailyMinutesDown: {
            '2022-08-30': 26,
            '2022-07-20': 34,
            '2022-06-17': 6,
            '2022-05-19': 8,
            '2022-03-16': 86
        }
    }
]