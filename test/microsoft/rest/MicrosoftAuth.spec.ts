import { expect } from 'chai'
import nock from 'nock'
import { MicrosoftResponse, MicrosoftErrorCode } from '../../../lib/microsoft/rest/MicrosoftResponse'
import { assertResponse, expectSuccess } from '../../common/RestResponseUtil'
import { AuthorizationTokenResponse, AuthTokenRequest, MCInfoState, MCTokenResponse, MCUserInfo, MicrosoftAuth, RefreshTokenRequest, XboxServiceTokenResponse } from '../../../lib/microsoft/rest/MicrosoftAuth'
import { URL } from 'url'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function expectMicrosoftResponse(res: MicrosoftResponse<unknown>, responseCode: MicrosoftErrorCode, negate = false): void {
    assertResponse(res)
    expect(res).to.have.property('microsoftErrorCode')
    if(!negate) {
        expect(res.microsoftErrorCode).to.equal(responseCode)
    } else {
        expect(res.microsoftErrorCode).to.not.equal(responseCode)
    }
}

describe('[Microsoft Auth] Errors', () => {

    after(() => {
        nock.cleanAll()
    })

    it('getXBLToken (UNDER_18)', async () => {

        const XBL_AUTH_URL = new URL(MicrosoftAuth.XBL_AUTH_ENDPOINT)

        nock(XBL_AUTH_URL.origin)
            .post(XBL_AUTH_URL.pathname)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .reply(401, (uri, requestBody: unknown): { Identity: string, XErr: number, Message: string, Redirect: string } => {
                return {
                    Identity: '0',
                    XErr: 2148916238,
                    Message: '',
                    Redirect: 'https://start.ui.xboxlive.com/AddChildToFamily'
                }
            })

        const res = await MicrosoftAuth.getXBLToken('A_TOKEN')
        expectMicrosoftResponse(res, MicrosoftErrorCode.UNDER_18)
        expect(res.data).to.be.a('null')
        expect(res.error).to.not.be.a('null')

    })

    it('getXBLToken (NOT_OWNED)', async () => {

        const XBL_AUTH_URL = new URL(MicrosoftAuth.XBL_AUTH_ENDPOINT)

        nock(XBL_AUTH_URL.origin)
            .post(XBL_AUTH_URL.pathname)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
            .reply(404, (uri, requestBody: unknown): Record<string, any> => {
                return {
                    path: '/minecraft/profile',
                    errorType: 'NOT_FOUND',
                    error: 'NOT_FOUND',
                    errorMessage: 'The server has not found anything matching the request URI',
                    developerMessage: 'The server has not found anything matching the request URI'
                }
            })

        const res = await MicrosoftAuth.getXBLToken('A_TOKEN')
        expectMicrosoftResponse(res, MicrosoftErrorCode.NOT_OWNED)
        expect(res.data).to.be.a('null')
        expect(res.error).to.not.be.a('null')

    })

})

describe('[Microsoft Auth] Auth', () => {
    
    it('getAccessToken (Auth + Refresh)', async () => {

        const TOKEN_URL = new URL(MicrosoftAuth.TOKEN_ENDPOINT)

        nock(TOKEN_URL.origin)
            .post(TOKEN_URL.pathname)
            .twice()
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .reply(200, (uri, requestBody: AuthTokenRequest | RefreshTokenRequest): AuthorizationTokenResponse => {
                const mockResponse: AuthorizationTokenResponse = {
                    token_type: 'bearer',
                    expires_in: 86400,
                    scope: 'XboxLive.signin',
                    access_token: 'A_TOKEN',
                    refresh_token: 'R_TOKEN',
                    user_id: '889ed4a3d844f672',
                    foci: '1'
                }

                return mockResponse
            })

        const res = await MicrosoftAuth.getAccessToken('abc', false, 'dummyClient')
        expectSuccess(res)
        expect(res.data!.access_token).to.equal('A_TOKEN')

        const res2 = await MicrosoftAuth.getAccessToken('abc', true, 'dummyClient')
        expectSuccess(res2)
        expect(res2.data!.refresh_token).to.equal('R_TOKEN')

    })

    it('getXBLToken', async () => {

        const XBL_AUTH_URL = new URL(MicrosoftAuth.XBL_AUTH_ENDPOINT)

        nock(XBL_AUTH_URL.origin)
            .post(XBL_AUTH_URL.pathname)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
            .reply(200, (uri, requestBody: any): XboxServiceTokenResponse => {
                const mockResponse: XboxServiceTokenResponse = {
                    IssueInstant: '2020-12-07T19:52:08.4463796Z',
                    NotAfter: '2020-12-21T19:52:08.4463796Z',
                    Token: 'XBL_TOKEN',
                    DisplayClaims: {
                        xui: [
                            {
                                uhs: 'userhash'
                            }
                        ]
                    }
                }

                return mockResponse
            })

        const res = await MicrosoftAuth.getXBLToken('A_TOKEN')
        expectSuccess(res)
        expect(res.data!.Token).to.equal('XBL_TOKEN')

    })

    it('getXSTSToken', async () => {

        const XSTS_AUTH_URL = new URL(MicrosoftAuth.XSTS_AUTH_ENDPOINT)

        nock(XSTS_AUTH_URL.origin)
            .post(XSTS_AUTH_URL.pathname)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
            .reply(200, (uri, requestBody: any): XboxServiceTokenResponse => {
                const mockResponse: XboxServiceTokenResponse = {
                    IssueInstant: '2020-12-07T19:52:08.4463796Z',
                    NotAfter: '2020-12-21T19:52:08.4463796Z',
                    Token: 'XSTS_TOKEN',
                    DisplayClaims: {
                        xui: [
                            {
                                uhs: 'userhash'
                            }
                        ]
                    }
                }

                return mockResponse
            })

        const res = await MicrosoftAuth.getXSTSToken({
            IssueInstant: '2020-12-07T19:52:08.4463796Z',
            NotAfter: '2020-12-21T19:52:08.4463796Z',
            Token: 'XBL_TOKEN',
            DisplayClaims: {
                xui: [
                    {
                        uhs: 'userhash'
                    }
                ]
            }
        })
        expectSuccess(res)
        expect(res.data!.Token).to.equal('XSTS_TOKEN')

    })

    it('getMCAccessToken', async () => {

        const MC_AUTH_URL = new URL(MicrosoftAuth.MC_AUTH_ENDPOINT)

        nock(MC_AUTH_URL.origin)
            .post(MC_AUTH_URL.pathname)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
            .reply(200, (uri, requestBody: any): MCTokenResponse => {
                const mockResponse: MCTokenResponse = {
                    username: 'uuid',
                    roles: [],
                    access_token: 'MC_A_TOKEN',
                    token_type: 'Bearer',
                    expires_in: 86400
                }

                return mockResponse
            })

        const res = await MicrosoftAuth.getMCAccessToken({
            IssueInstant: '2020-12-07T19:52:08.4463796Z',
            NotAfter: '2020-12-21T19:52:08.4463796Z',
            Token: 'XSTS_TOKEN',
            DisplayClaims: {
                xui: [
                    {
                        uhs: 'userhash'
                    }
                ]
            }
        })
        expectSuccess(res)
        expect(res.data!.access_token).to.equal('MC_A_TOKEN')

    })

    it('getMCProfile', async () => {

        const MC_PROFILE_URL = new URL(MicrosoftAuth.MC_PROFILE_ENDPOINT)

        nock(MC_PROFILE_URL.origin)
            .get(MC_PROFILE_URL.pathname)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
            .reply(200, (uri): MCUserInfo => {
                const mockResponse: MCUserInfo = {
                    id: '986dec87b7ec47ff89ff033fdb95c4b5',
                    name: 'HowDoesAuthWork',
                    skins: [{
                        id: '6a6e65e5-76dd-4c3c-a625-162924514568',
                        state: MCInfoState.ACTIVE,
                        url: 'http://textures.minecraft.net/texture/1a4af718455d4aab528e7a61f86fa25e6a369d1768dcb13f7df319a713eb810b',
                        variant: 'CLASSIC',
                        alias: 'STEVE'
                    }],
                    capes: []
                }

                return mockResponse
            })

        const res = await MicrosoftAuth.getMCProfile('MC_A_TOKEN')
        expectSuccess(res)
        expect(res.data!.id).to.equal('986dec87b7ec47ff89ff033fdb95c4b5')

    })

})