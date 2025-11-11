export class FileValidationError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'FileValidationError'
    }
}
