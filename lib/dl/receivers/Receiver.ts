export interface Receiver {

    execute(message: unknown): Promise<void>

}

export interface ErrorReply {
    response: 'error'
}