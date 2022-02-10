import { DisplayableError, RestResponse } from '../../common/rest/RestResponse'

/**
 * @see https://wiki.vg/Authentication#Errors
 */
export enum MojangErrorCode {
    ERROR_METHOD_NOT_ALLOWED,       // INTERNAL
    ERROR_NOT_FOUND,                // INTERNAL
    ERROR_USER_MIGRATED,
    ERROR_INVALID_CREDENTIALS,
    ERROR_RATELIMIT,
    ERROR_INVALID_TOKEN,
    ERROR_ACCESS_TOKEN_HAS_PROFILE, // ??
    ERROR_CREDENTIALS_MISSING,      // INTERNAL
    ERROR_INVALID_SALT_VERSION,     // ??
    ERROR_UNSUPPORTED_MEDIA_TYPE,   // INTERNAL
    ERROR_GONE,
    ERROR_UNREACHABLE,
    ERROR_NOT_PAID,                 // Not automatically detected, response is 200 with a certain body.
    UNKNOWN
}

export function mojangErrorDisplayable(errorCode: MojangErrorCode): DisplayableError {
    switch(errorCode) {
        case MojangErrorCode.ERROR_METHOD_NOT_ALLOWED:
            return {
                title: 'Internal Error:<br>Method Not Allowed',
                desc: 'Method not allowed. Please report this error.'
            }
        case MojangErrorCode.ERROR_NOT_FOUND:
            return {
                title: 'Internal Error:<br>Not Found',
                desc: 'The authentication endpoint was not found. Please report this issue.'
            }
        case MojangErrorCode.ERROR_USER_MIGRATED:
            return {
                title: 'Error During Login:<br>Account Migrated',
                desc: 'You\'ve attempted to login with a migrated account. Try again using the account email as the username.'
            }
        case MojangErrorCode.ERROR_INVALID_CREDENTIALS:
            return {
                title: 'Error During Login:<br>Invalid Credentials',
                desc: 'The email or password you\'ve entered is incorrect. Please try again.'
            }
        case MojangErrorCode.ERROR_RATELIMIT:
            return {
                title: 'Error During Login:<br>Too Many Attempts',
                desc: 'There have been too many login attempts with this account recently. Please try again later.'
            }
        case MojangErrorCode.ERROR_INVALID_TOKEN:
            return {
                title: 'Error During Login:<br>Invalid Token',
                desc: 'The provided access token is invalid.'
            }
        case MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE:
            return {
                title: 'Error During Login:<br>Token Has Profile',
                desc: 'Access token already has a profile assigned. Selecting profiles is not implemented yet.'
            }
        case MojangErrorCode.ERROR_CREDENTIALS_MISSING:
            return {
                title: 'Error During Login:<br>Credentials Missing',
                desc: 'Username/password was not submitted or password is less than 3 characters.'
            }
        case MojangErrorCode.ERROR_INVALID_SALT_VERSION:
            return {
                title: 'Error During Login:<br>Invalid Salt Version',
                desc: 'Invalid salt version.'
            }
        case MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE:
            return {
                title: 'Internal Error:<br>Unsupported Media Type',
                desc: 'Unsupported media type. Please report this error.'
            }
        case MojangErrorCode.ERROR_GONE:
            return {
                title: 'Error During Login:<br>Account Migrated',
                desc: 'Account has been migrated to a Microsoft account. Please log in with Microsoft.'
            }
        case MojangErrorCode.ERROR_UNREACHABLE:
            return {
                title: 'Error During Login:<br>Unreachable',
                desc: 'Unable to reach the authentication servers. Ensure that they are online and you are connected to the internet.'
            }
        case MojangErrorCode.ERROR_NOT_PAID:
            return {
                title: 'Error During Login:<br>Game Not Purchased',
                desc: 'The account you are trying to login with has not purchased a copy of Minecraft.<br>You may purchase a copy on <a href="https://minecraft.net/">Minecraft.net</a>'
            }
        case MojangErrorCode.UNKNOWN:
            return {
                title: 'Unknown Error During Login',
                desc: 'An unknown error has occurred. Please see the console for details.'
            }
        default:
            throw new Error(`Unknown error code: ${errorCode}`)
    }
}

export interface MojangResponse<T> extends RestResponse<T> {
    mojangErrorCode?: MojangErrorCode
    isInternalError?: boolean
}

export interface MojangErrorBody {
    error: string
    errorMessage: string
    cause?: string
}

/**
 * Resolve the error response code from the response body.
 * 
 * @param body The mojang error body response.
 */
export function decipherErrorCode(body: MojangErrorBody): MojangErrorCode {

    if(body.error === 'Method Not Allowed') {
        return MojangErrorCode.ERROR_METHOD_NOT_ALLOWED
    } else if(body.error === 'Not Found') {
        return MojangErrorCode.ERROR_NOT_FOUND
    } else if(body.error === 'Unsupported Media Type') {
        return MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE
    } else if(body.error === 'ForbiddenOperationException') {

        if(body.cause && body.cause === 'UserMigratedException') {
            return MojangErrorCode.ERROR_USER_MIGRATED
        }

        if(body.errorMessage === 'Invalid credentials. Invalid username or password.') {
            return MojangErrorCode.ERROR_INVALID_CREDENTIALS
        } else if(body.errorMessage === 'Invalid credentials.') {
            return MojangErrorCode.ERROR_RATELIMIT
        } else if(body.errorMessage === 'Invalid token.') {
            return MojangErrorCode.ERROR_INVALID_TOKEN
        } else if(body.errorMessage === 'Forbidden') {
            return MojangErrorCode.ERROR_CREDENTIALS_MISSING
        }

    } else if(body.error === 'IllegalArgumentException') {

        if(body.errorMessage === 'Access token already has a profile assigned.') {
            return MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE
        } else if(body.errorMessage === 'Invalid salt version') {
            return MojangErrorCode.ERROR_INVALID_SALT_VERSION
        }

    } else if(body.error === 'ResourceException' || body.error === 'GoneException') {
        return MojangErrorCode.ERROR_GONE
    }

    return MojangErrorCode.UNKNOWN

}

// These indicate problems with the code and not the data.
export function isInternalError(errorCode: MojangErrorCode): boolean {
    switch(errorCode) {
        case MojangErrorCode.ERROR_METHOD_NOT_ALLOWED:       // We've sent the wrong method to an endpoint. (ex. GET to POST)
        case MojangErrorCode.ERROR_NOT_FOUND:                // Indicates endpoint has changed. (404)
        case MojangErrorCode.ERROR_ACCESS_TOKEN_HAS_PROFILE: // Selecting profiles isn't implemented yet. (Shouldnt happen)
        case MojangErrorCode.ERROR_CREDENTIALS_MISSING:      // Username/password was not submitted. (UI should forbid this)
        case MojangErrorCode.ERROR_INVALID_SALT_VERSION:     // ??? (Shouldnt happen)
        case MojangErrorCode.ERROR_UNSUPPORTED_MEDIA_TYPE:   // Data was not submitted as application/json
            return true
        default:
            return false
    }
}