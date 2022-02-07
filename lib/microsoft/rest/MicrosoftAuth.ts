import { handleGotError, RestResponseStatus } from '../../common/rest/RestResponse'
import { LoggerUtil } from '../../util/LoggerUtil'
import got, { HTTPError, RequestError } from 'got'
import { decipherErrorCode, MicrosoftErrorCode, MicrosoftResponse } from './MicrosoftResponse'

/* ***********************************/
/*      Microsoft OAuth Models       */
/* ***********************************/

/**
 * Common properties for a request to Microsoft's OAuth endpoint.
 */
export interface AbstractTokenRequest {
    client_id: string
    scope: string
    redirect_uri: string
}
/**
 * Request body for getting a Microsoft OAuth Access Token from
 * an authorization code.
 */
export interface AuthTokenRequest extends AbstractTokenRequest {
    grant_type: 'authorization_code'
    code: string
}
/**
 * Request body for getting a Microsoft OAuth Access Token by refreshing
 * an existing token.
 */
export interface RefreshTokenRequest extends AbstractTokenRequest {
    grant_type: 'refresh_token'
    refresh_token: string
}

/**
 * Microsoft OAuth Response.
 */
export interface AuthorizationTokenResponse {
    token_type: string
    expires_in: number
    scope: string
    access_token: string
    refresh_token: string
    user_id: string
    foci: string
}

/* ***********************************/
/*         Xbox Live Models          */
/* ***********************************/

/**
 * Xbox Live Response.
 */
export interface XboxServiceTokenResponse {
    IssueInstant: string
    NotAfter: string
    Token: string
    DisplayClaims: DisplayClaim
}
export interface DisplayClaim {
    xui: {
        uhs: string
    }[]
}

/* ***********************************/
/*       Minecraft Auth Models       */
/* ***********************************/

/**
 * Minecraft Authorization Response.
 */
export interface MCTokenResponse {
    username: string
    roles: unknown[]
    access_token: string
    token_type: string
    expires_in: number
}

/* ***********************************/
/*       Minecraft Data Models       */
/* ***********************************/

/**
 * Minecraft Profile Response.
 */
export interface MCUserInfo {
    id: string
    name: string
    skins: MCSkinInfo[]
    capes: MCCapeInfo[]
}
export enum MCInfoState {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE'
}
export interface MCInfo {
    id: string
    state: MCInfoState
    url: string
}
export interface MCSkinInfo extends MCInfo {
    variant: string
    alias: string
}
export interface MCCapeInfo extends MCInfo {
    alias: string
}

/* ***********************************/
/*         Microsoft Auth API        */
/* ***********************************/

export class MicrosoftAuth {

    private static readonly logger = LoggerUtil.getLogger('MicrosoftAuth')

    private static readonly TIMEOUT = 2500

    public static readonly TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token'
    public static readonly XBL_AUTH_ENDPOINT = 'https://user.auth.xboxlive.com/user/authenticate'
    public static readonly XSTS_AUTH_ENDPOINT = 'https://xsts.auth.xboxlive.com/xsts/authorize'
    public static readonly MC_AUTH_ENDPOINT = 'https://api.minecraftservices.com/authentication/login_with_xbox'
    public static readonly MC_ENTITLEMENT_ENDPOINT = 'https://api.minecraftservices.com/entitlements/mcstore'
    public static readonly MC_PROFILE_ENDPOINT = 'https://api.minecraftservices.com/minecraft/profile'

    private static readonly STANDARD_HEADERS = {
        'Content-Type': 'application/json',
        Accept: 'application/json'
    }

    /**
     * MicrosoftAuthAPI implementation of handleGotError. This function will additionally
     * analyze the response from Microsoft and populate the microsoft-specific error information.
     * 
     * @param operation The operation name, for logging purposes.
     * @param error The error that occurred.
     * @param dataProvider A function to provide a response body.
     * @returns A MicrosoftResponse configured with error information.
     */
    private static handleGotError<T>(operation: string, error: RequestError, dataProvider: () => T): MicrosoftResponse<T> {

        const response: MicrosoftResponse<T> = handleGotError(operation, error, MicrosoftAuth.logger, dataProvider)

        if(error instanceof HTTPError) {
            response.microsoftErrorCode = decipherErrorCode(error.response.body)
        } else {
            response.microsoftErrorCode = MicrosoftErrorCode.UNKNOWN
        }

        return response
    }

    /**
     * Acquire a Microsoft Access Token, either for the first time or through refreshing an existing token.
     * 
     * @param code Authorization Code or Refresh Token
     * @param refresh True if this is a refresh, false otherwise.
     * @param clientId The Azure Application (client) ID.
     * @returns A MicrosoftResponse for this operation.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authorization_Code_-.3E_Authorization_Token
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Refreshing_Tokens
     */
    public static async getAccessToken(code: string, refresh: boolean, clientId: string): Promise<MicrosoftResponse<AuthorizationTokenResponse | null>> {
        try {

            const BASE_FORM: AbstractTokenRequest = {
                client_id: clientId,
                scope: 'XboxLive.signin',
                redirect_uri: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
            }

            let form
            if(refresh) {
                form = {
                    ...BASE_FORM,
                    refresh_token: code,
                    grant_type: 'refresh_token'
                } as RefreshTokenRequest
            } else {
                form = {
                    ...BASE_FORM,
                    code: code,
                    grant_type: 'authorization_code'
                } as AuthTokenRequest
            }

            const res = await got.post<AuthorizationTokenResponse>(this.TOKEN_ENDPOINT, {
                form,
                responseType: 'json'
            })

            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {
            return MicrosoftAuth.handleGotError(`Get ${refresh ? 'Refresh' : 'Auth'} Token`, error as RequestError, () => null)
        }
    }

    /**
     * Authenticate with Xbox Live with a Microsoft Access Token.
     * 
     * @param accessToken A Microsoft Access Token, from getAccessToken.
     * @returns A MicrosoftResponse for this operation.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authenticate_with_XBL
     */
    public static async getXBLToken(accessToken: string): Promise<MicrosoftResponse<XboxServiceTokenResponse | null>> {
        try {

            // TODO TYPE REQUEST
            const res = await got.post<XboxServiceTokenResponse>(this.XBL_AUTH_ENDPOINT, {
                json: {
                    Properties: {
                        AuthMethod: 'RPS',
                        SiteName: 'user.auth.xboxlive.com',
                        RpsTicket: `d=${accessToken}`
                    },
                    RelyingParty: 'http://auth.xboxlive.com',
                    TokenType: 'JWT'
                },
                headers: MicrosoftAuth.STANDARD_HEADERS,
                responseType: 'json'
            })

            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {
            return MicrosoftAuth.handleGotError('Get XBL Token', error as RequestError, () => null)
        }
    }

    /**
     * Acquire an Xbox Secure Token Service (XSTS) Token.
     * 
     * @param xblResponse An Xbox Live token response, from getXBLToken.
     * @returns A MicrosoftResponse for this operation.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authenticate_with_XSTS
     */
    public static async getXSTSToken(xblResponse: XboxServiceTokenResponse): Promise<MicrosoftResponse<XboxServiceTokenResponse | null>> {
        try {

            // TODO TYPE REQUEST
            const res = await got.post<XboxServiceTokenResponse>(this.XSTS_AUTH_ENDPOINT, {
                json: {
                    Properties: {
                        SandboxId: 'RETAIL',
                        UserTokens: [xblResponse.Token]
                    },
                    RelyingParty: 'rp://api.minecraftservices.com/',
                    TokenType: 'JWT'
                },
                headers: MicrosoftAuth.STANDARD_HEADERS,
                responseType: 'json'
            })

            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {
            return MicrosoftAuth.handleGotError('Get XSTS Token', error as RequestError, () => null)
        }
    }

    /**
     * Authenticate with Minecraft.
     * 
     * @param xstsResponse An Xbox Secure Token Service (XSTS) Token response, from getXSTSToken.
     * @returns A MicrosoftResponse for this operation.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authenticate_with_Minecraft
     */
    public static async getMCAccessToken(xstsResponse: XboxServiceTokenResponse): Promise<MicrosoftResponse<MCTokenResponse | null>> {
        try {

            // TODO TYPE REQUEST
            const res = await got.post<MCTokenResponse>(this.MC_AUTH_ENDPOINT, {
                json: {
                    identityToken: `XBL3.0 x=${xstsResponse.DisplayClaims.xui[0].uhs};${xstsResponse.Token}`
                },
                headers: MicrosoftAuth.STANDARD_HEADERS,
                responseType: 'json'
            })

            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {
            return MicrosoftAuth.handleGotError('Get MC Access Token', error as RequestError, () => null)
        }
    }

    // TODO Review https://wiki.vg/Microsoft_Authentication_Scheme#Checking_Game_Ownership
    // Cannot detect Xbox Game Pass users, so what good is this? Should we implement it just cause..?
    // public static async checkEntitlement(accessToken: string): Promise<MicrosoftResponse<unknown | null>> {
    //     try {

    //         const res = await got.get<unknown>(this.MC_ENTITLEMENT_ENDPOINT, {
    //             headers: {
    //                 Authorization: `Bearer ${accessToken}`
    //             },
    //             responseType: 'json'
    //         })

    //         return {
    //             data: res.body,
    //             responseStatus: RestResponseStatus.SUCCESS
    //         }

    //     } catch(error) {
    //         return MicrosoftAuth.handleGotError('Check Entitlement', error as RequestError, () => null)
    //     }
    // }

    /**
     * Get MC Profile Data, specifically account name and uuid.
     * 
     * @param mcAccessToken A Minecraft Access Token, from getMCAccessToken.
     * @returns A MicrosoftResponse for this operation.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Get_the_profile
     */
    public static async getMCProfile(mcAccessToken: string): Promise<MicrosoftResponse<MCUserInfo | null>> {
        try {

            const res = await got.get<MCUserInfo>(this.MC_PROFILE_ENDPOINT, {
                headers: {
                    Authorization: `Bearer ${mcAccessToken}`
                },
                responseType: 'json'
            })

            return {
                data: res.body,
                responseStatus: RestResponseStatus.SUCCESS
            }

        } catch(error) {
            return MicrosoftAuth.handleGotError('Get MC Profile', error as RequestError, () => null)
        }
    }

}

