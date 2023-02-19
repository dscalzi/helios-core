import { LoggerUtil } from '../../util/LoggerUtil'
import { IndexProcessor } from '../IndexProcessor'
import { AssetGuardError } from '../AssetGuardError'
import { validateLocalFile } from '../../common/util/FileUtils'
import { Asset } from '../Asset'
import { HeliosDistribution, HeliosModule, HeliosServer } from '../../common/distribution/DistributionFactory'

export class DistributionIndexProcessor extends IndexProcessor {

    private static readonly logger = LoggerUtil.getLogger('DistributionIndexProcessor')

    constructor(commonDir: string, protected distribution: HeliosDistribution, protected serverId: string) {
        super(commonDir)
    }

    public async init(): Promise<void> {
        // no-op
    }

    public async validate(): Promise<{[category: string]: Asset[]}> {
        
        const server: HeliosServer = this.distribution.getServerById(this.serverId)!
        if(server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }

        const notValid: Asset[] = []
        await this.validateModules(server.modules, notValid)

        return {
            distribution: notValid
        }
    }

    private async validateModules(modules: HeliosModule[], accumulator: Asset[]): Promise<void> {
        for(const module of modules) {
            const hash = module.rawModule.artifact.MD5

            if(!await validateLocalFile(module.getPath(), 'md5', hash)) {
                accumulator.push({
                    id: module.rawModule.id,
                    hash: hash!,
                    size: module.rawModule.artifact.size,
                    url: module.rawModule.artifact.url,
                    path: module.getPath()
                })
            }

            if(module.hasSubModules()) {
                await this.validateModules(module.subModules, accumulator)
            }
        }
    }

}