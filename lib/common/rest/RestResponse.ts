import { RequestError, HTTPError, TimeoutError, ParseError } from 'got'
import { Logger } from 'winston'

/**
 * Rest Response status.
 */
export enum RestResponseStatus {
    /**
     * Status indicating the request was successful.
     */
    SUCCESS,
    /**
     * Status indicating there was a problem with the response.
     * All status codes outside the 200 range will have an error status.
     */
    ERROR
}

/**
 * Base RestResponse for generic REST calls.
 */
export interface RestResponse<T> {

    /**
     * The response body.
     */
    data: T
    /**
     * The response status.
     */
    responseStatus: RestResponseStatus
    /**
     * If responseStatus is ERROR, the error body.
     */
    error?: RequestError

}

/**
 * An object to translate an error code to a displayable message.
 */
export interface DisplayableError {
    /**
     * Error title.
     */
    title: string
    /**
     * Error description.
     */
    desc: string
}

export function isDisplayableError(it: unknown): boolean {
    return typeof it == 'object'
        && it != null
        && Object.prototype.hasOwnProperty.call(it, 'title')
        && Object.prototype.hasOwnProperty.call(it, 'desc')
}

/**
 * Handle a got error for a generic RestResponse.
 * 
 * @param operation The operation name, for logging purposes.
 * @param error The error that occurred.
 * @param logger A logger instance.
 * @param dataProvider A function to provide a response body.
 * @returns A RestResponse configured with error information.
 */
export function handleGotError<T>(operation: string, error: RequestError, logger: Logger, dataProvider: () => T): RestResponse<T> {
    const response: RestResponse<T> = {
        data: dataProvider(),
        responseStatus: RestResponseStatus.ERROR,
        error
    }
    
    if(error instanceof HTTPError) {
        logger.error(`Error during ${operation} request (HTTP Response ${error.response.statusCode})`, error)
        logger.debug('Response Details:')
        logger.debug('Body:', error.response.body)
        logger.debug('Headers:', error.response.headers)
    } else if(error.name === 'RequestError') {
        logger.error(`${operation} request recieved no response (${error.code}).`, error)
    } else if(error instanceof TimeoutError) {
        logger.error(`${operation} request timed out (${error.timings.phases.total}ms).`)
    } else if(error instanceof ParseError) {
        logger.error(`${operation} request recieved unexepected body (Parse Error).`)
    } else {
        // CacheError, ReadError, MaxRedirectsError, UnsupportedProtocolError, CancelError
        logger.error(`Error during ${operation} request.`, error)
    }

    return response
}