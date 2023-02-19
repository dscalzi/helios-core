
import { Asset } from './Asset'

export abstract class IndexProcessor {

    constructor(
        protected commonDir: string
    ) {}

    abstract init(): Promise<void>
    abstract validate(): Promise<{[category: string]: Asset[]}>

}