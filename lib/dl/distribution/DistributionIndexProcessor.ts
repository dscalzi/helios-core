import { LoggerUtil } from '../../util/LoggerUtil'
import { IndexProcessor } from '../IndexProcessor'
import { AssetGuardError } from '../AssetGuardError'
import { validateLocalFile, getVersionJsonPath} from '../../common/util/FileUtils'
import { Asset, HashAlgo } from '../Asset'
import { HeliosDistribution, HeliosModule, HeliosServer } from '../../common/distribution/DistributionFactory'
import { Type } from 'helios-distribution-types'
import { mcVersionAtLeast } from '../../common/util/MojangUtils'
import { ensureDir, readJson, writeJson } from 'fs-extra'
import StreamZip from 'node-stream-zip'
import { dirname } from 'path'
import { VersionJsonBase } from '../mojang/MojangTypes'

export class DistributionIndexProcessor extends IndexProcessor {

    private static readonly logger = LoggerUtil.getLogger('DistributionIndexProcessor')

    constructor(commonDir: string, protected distribution: HeliosDistribution, protected serverId: string) {
        super(commonDir)
    }

    public async init(): Promise<void> {
        // no-op
    }

    public totalStages(): number {
        return 1
    }

    public async validate(onStageComplete: () => Promise<void>): Promise<{[category: string]: Asset[]}> {
        
        const server: HeliosServer = this.distribution.getServerById(this.serverId)!
        if(server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }

        const notValid: Asset[] = []
        await this.validateModules(server.modules, notValid)
        await onStageComplete()

        return {
            distribution: notValid
        }
    }

    public async postDownload(): Promise<void> {
        await this.loadModLoaderVersionJson()
    }

    private async validateModules(modules: HeliosModule[], accumulator: Asset[]): Promise<void> {
        for(const module of modules) {
            const hash = module.rawModule.artifact.MD5

            if(!await validateLocalFile(module.getPath(), HashAlgo.MD5, hash)) {
                accumulator.push({
                    id: module.rawModule.id,
                    hash: hash!,
                    algo: HashAlgo.MD5,
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

    public async loadModLoaderVersionJson(): Promise<VersionJsonBase> {

        const server: HeliosServer = this.distribution.getServerById(this.serverId)!
        if(server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }

        const modLoaderModule = server.modules.find(({ rawModule: { type } }) => type === Type.ForgeHosted || type === Type.Forge || type === Type.Fabric)

        if(modLoaderModule == null) {
            throw new AssetGuardError('No mod loader found!')
        }

        if(modLoaderModule.rawModule.type === Type.Fabric
            || DistributionIndexProcessor.isForgeGradle3(server.rawServer.minecraftVersion, modLoaderModule.getMavenComponents().version)) {
            return await this.loadVersionManifest<VersionJsonBase>(modLoaderModule)
        } else {

            const zip = new StreamZip.async({ file: modLoaderModule.getPath() })

            try {

                const data = JSON.parse((await zip.entryData('version.json')).toString('utf8')) as VersionJsonBase
                const writePath = getVersionJsonPath(this.commonDir, data.id)
    
                await ensureDir(dirname(writePath))
                await writeJson(writePath, data)
    
                return data
            }
            finally {
                await zip.close()
            }
            
        }
    }

    public async loadVersionManifest<T>(modLoaderModule: HeliosModule): Promise<T> {
        const versionManifstModule = modLoaderModule.subModules.find(({ rawModule: { type }}) => type === Type.VersionManifest)
        if(versionManifstModule == null) {
            throw new AssetGuardError('No mod loader version manifest module found!')
        }

        return await readJson(versionManifstModule.getPath(), 'utf-8') as T
    }

    // TODO Move this to a util maybe
    public static isForgeGradle3(mcVersion: string, forgeVersion: string): boolean {

        if(mcVersionAtLeast('1.13', mcVersion)) {
            return true
        }

        try {
            
            const forgeVer = forgeVersion.split('-')[1]

            const maxFG2 = [14, 23, 5, 2847]
            const verSplit = forgeVer.split('.').map(v => Number(v))

            for(let i=0; i<maxFG2.length; i++) {
                if(verSplit[i] > maxFG2[i]) {
                    return true
                } else if(verSplit[i] < maxFG2[i]) {
                    return false
                }
            }
        
            return false

        } catch(err) {
            throw new Error('Forge version is complex (changed).. launcher requires a patch.')
        }
    }

}