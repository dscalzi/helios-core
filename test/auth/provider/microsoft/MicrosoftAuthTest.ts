import { expect } from 'chai'
import nock from 'nock'
import { MicrosoftResponse, MicrosoftErrorCode } from '../../../../lib/auth/provider/microsoft/MicrosoftResponse'
import { assertResponse, expectSuccess } from '../../../common/RestResponseUtil'
import { AuthorizationTokenResponse, AuthTokenRequest, MicrosoftAuth, RefreshTokenRequest } from '../../../../lib/auth/provider/microsoft/MicrosoftAuth'
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

        const res = await MicrosoftAuth.getAccessToken('abc', false)
        expectSuccess(res)
        expect(res.data!.access_token).to.equal('A_TOKEN')

        const res2 = await MicrosoftAuth.getAccessToken('abc', true)
        expectSuccess(res2)
        expect(res2.data!.refresh_token).to.equal('R_TOKEN')

    })

})