import { handleGotError, RestResponse, RestResponseStatus } from 'lib/auth/common/RestResponse'
import { LoggerUtil } from '../../common/LoggerUtil'
import got from 'got'

export class MicrosoftAuth {

    private static readonly logger = LoggerUtil.getLogger('MicrosoftAuth')

    private static readonly TIMEOUT = 2500

    public static readonly TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    public static readonly XBL_AUTH_ENDPOINT = 'https://user.auth.xboxlive.com/user/authenticate'
    public static readonly XSTS_AUTH_ENDPOINT = 'https://xsts.auth.xboxlive.com/xsts/authorize'
    public static readonly MC_AUTH_ENDPOINT = 'https://api.minecraftservices.com/authentication/login_with_xbox'
    public static readonly MC_PROFILE_ENDPOINT = 'https://api.minecraftservices.com/minecraft/profile'

    // TODO TYPE RETURN
    public static async getXBLToken(accessToken: string): Promise<RestResponse<any>> {
        try {

            // TODO TYPE RESPONSE
            // TODO TYPE REQUEST
            const res = await got.post<any>(this.XBL_AUTH_ENDPOINT, {
                json: {
                    Properties: {
                        AuthMethod: 'RPS',
                        SiteName: 'user.auth.xboxlive.com',
                        RpsTicket: `d=${accessToken}`
                    },
                    RelyingParty: 'http://auth.xboxlive.com',
                    TokenType: 'JWT'
                }
            })

            // TODO TYPE RESPONSE
            return {
                data: {
                    token: res.body.Token,
                    uhs: res.body.DisplayClaims.xui[0].uhs
                },
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {
            return handleGotError('Get XBL Token', error, MicrosoftAuth.logger, () => undefined)
        }

    }

}