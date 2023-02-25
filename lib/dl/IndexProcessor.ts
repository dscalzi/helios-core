
import { Asset } from './Asset'

export abstract class IndexProcessor {

    constructor(
        protected commonDir: string
    ) {}

    abstract init(): Promise<void>
    abstract totalStages(): number
    abstract validate(onStageComplete: () => Promise<void>): Promise<{[category: string]: Asset[]}>
    abstract postDownload(): Promise<void>

}