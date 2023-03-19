export interface Receiver {

    execute(message: unknown): Promise<void>

    parseError(error: unknown): Promise<string | undefined>

}

export interface ErrorReply {
    response: 'error'
    displayable?: string
}