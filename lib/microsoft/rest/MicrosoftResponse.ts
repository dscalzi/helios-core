import { DisplayableError, RestResponse } from '../../common/rest/RestResponse'

/**
 * Various error codes from any point of the Microsoft authentication process.
 */
export enum MicrosoftErrorCode {
    /**
     * Unknown Error
     */
    UNKNOWN,
    /**
     * Profile Error
     * 
     * Account does not own the game.
     * 
     * Note that Xbox Game Pass users who haven't logged into the new Minecraft
     * Launcher at least once will not return a profile, and will need to login
     * once after activating Xbox Game Pass to setup their Minecraft username.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Get_the_profile
     */
    NOT_OWNED,
    /**
     * XSTS Error
     * 
     * The account doesn't have an Xbox account. Once they sign up for one
     * (or login through minecraft.net to create one) then they can proceed
     * with the login. This shouldn't happen with accounts that have purchased
     * Minecraft with a Microsoft account, as they would've already gone
     * through that Xbox signup process.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authenticate_with_XSTS
     */
    NO_XBOX_ACCOUNT = 2148916233,
    /**
     * XSTS Error
     * 
     * The account is from a country where Xbox Live is not available/banned.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authenticate_with_XSTS
     */
    XBL_BANNED = 2148916235,
    /**
     * XSTS Error
     * 
     * The account is a child (under 18) and cannot proceed unless the account
     * is added to a Family by an adult. This only seems to occur when using a
     * custom Microsoft Azure application. When using the Minecraft launchers
     * client id, this doesn't trigger.
     * 
     * @see https://wiki.vg/Microsoft_Authentication_Scheme#Authenticate_with_XSTS
     */
    UNDER_18 = 2148916238
}

export function microsoftErrorDisplayable(errorCode: MicrosoftErrorCode): DisplayableError {
    switch(errorCode) {
        case MicrosoftErrorCode.NOT_OWNED:
            return {
                title: 'Error During Login:<br>Game Not Owned',
                desc: 'The account you are trying to login with has not purchased a copy of Minecraft.<br>You may purchase a copy on <a href="https://minecraft.net/">Minecraft.net</a><br><br><strong>NOTE: Xbox Game Pass users must log in with the vanilla launcher at least once to set up their username.</strong>'
            }
        case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
            return {
                title: 'Error During Login:<br>No Xbox Account',
                desc: 'Your Microsoft account has no Xbox account associated with it.'
            }
        case MicrosoftErrorCode.XBL_BANNED:
            return {
                title: 'Error During Login:<br>Xbox Live Unavailable',
                desc: 'Your Microsoft account is from a country where Xbox Live is not available or banned.'
            }
        case MicrosoftErrorCode.UNDER_18:
            return {
                title: 'Error During Login:<br>Parental Approval Required',
                desc: 'Accounts for users under the age of 18 must be added to a Family by an adult.'
            }
        case MicrosoftErrorCode.UNKNOWN:
            return {
                title: 'Unknown Error During Login',
                desc: 'An unknown error has occurred. Please see the console for details.'
            }
    }
}

export interface MicrosoftResponse<T> extends RestResponse<T> {
    microsoftErrorCode?: MicrosoftErrorCode
}

/**
 * Resolve the error response code from the response body.
 * 
 * @param body The microsoft error body response.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function decipherErrorCode(body: any): MicrosoftErrorCode {

    if(body) {
        if(body.path === '/minecraft/profile' && body.errorType === 'NOT_FOUND') {
            return MicrosoftErrorCode.NOT_OWNED
        }
        if(body.XErr) {
            const xErr: number = body.XErr
            switch(xErr) {
                case MicrosoftErrorCode.NO_XBOX_ACCOUNT:
                    return MicrosoftErrorCode.NO_XBOX_ACCOUNT
                case MicrosoftErrorCode.XBL_BANNED:
                    return MicrosoftErrorCode.XBL_BANNED
                case MicrosoftErrorCode.UNDER_18:
                    return MicrosoftErrorCode.UNDER_18
            }
        }
    }

    return MicrosoftErrorCode.UNKNOWN
}