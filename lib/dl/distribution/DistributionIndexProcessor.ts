import { LoggerUtil } from '../../util/LoggerUtil'
import { IndexProcessor } from '../IndexProcessor'
import { AssetGuardError } from '../AssetGuardError'
import { validateLocalFile, getVersionJsonPath} from '../../common/util/FileUtils'
import { Asset, HashAlgo } from '../Asset'
import { HeliosDistribution, HeliosModule, HeliosServer } from '../../common/distribution/DistributionFactory'
import { Type } from 'helios-distribution-types'
import { mcVersionAtLeast } from '../../common/util/MojangUtils'
import { copyFile, ensureDir, exists, readFile, readJson, writeFile, writeJson } from 'fs-extra'
import StreamZip from 'node-stream-zip'
import { dirname, join } from 'path'
import { spawn } from 'child_process'

const logger = LoggerUtil.getLogger('DistributionIndexProcessor')

export class DistributionIndexProcessor extends IndexProcessor {

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
        // no-op
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

    /**
     * Install forge with ForgeInstallerCLI.
     *
     * @param {string} javaExecPath Java path.
     * @param {string} wrapperPath ForgeInstallerCLI.jar path.
     * @param {(percent: number) => void} onProgress Progress callback.
     * @returns {Promise.<void>} An empty promise to indicate the installation has completed.
     */
    public async installForge(
        javaExecPath: string,
        wrapperPath: string,
        onProgress: (percent: number) => void
    ): Promise<void> {
        const server: HeliosServer = this.distribution.getServerById(this.serverId)!
        if(server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }

        const forgeModule = server.modules.find(({ rawModule: { type } }) => type === Type.Forge)

        if(forgeModule == null) {
            // Before 1.12, Forge was installed already.
            return
        }

        if(!DistributionIndexProcessor.isForgeGradle3(server.rawServer.minecraftVersion, forgeModule.getMavenComponents().version)) {
            // Before Forge Gradle 3, Forge was installed already.
            return
        }

        // Forge version is in the format: 1.16.5-36.2.39.json
        const forgeVersion = forgeModule.getMavenComponents().version
        const forgeManifest = join(this.commonDir, 'versions', forgeVersion, `${forgeVersion}.json`)
        
        // If the forge version already exists, we don't need to install it.
        if(await exists(forgeManifest)) {
            logger.info('Forge version already exists, skipping installation.')
            return
        }

        // Forge installer is in the format: forge-1.16.5-36.2.39-installer.jar
        const installerExecPath = forgeModule.getPath()

        // Required for the installer to function.
        await writeFile(join(this.commonDir, 'launcher_profiles.json'), JSON.stringify({}))

        // Clamped lerp function.
        function lerp(a: number, b: number, t: number): number {
            if(b == a) return a
            if(t < 0) return a
            if(t > 1) return b
            return a + t * (b - a)
        }

        // Stages of the forge installer.
        const stages = [
            { percent: 0, message: '[Progress.Stage] Extracting json', est: 1 },
            { percent: 2, message: '[Progress.Stage] Considering minecraft client jar', est: 1 },
            { percent: 5, message: '[Progress.Start] Downloading libraries' },
            { percent: 35, message: '[Progress.Start] Created Temporary Directory: ' },
            { percent: 40, message: '[Progress.Start] Building Processors', est: 1 },
            { percent: 45, message: 'Splitting: ', est: 7000, countAll: true },
            // for 1.20.1
            { percent: 60, nextPercent: 80, message: '  MainClass: net.minecraftforge.fart.Main', est: 2500, countAll: true },
            // for 1.16.5
            { percent: 60, nextPercent: 80, message: '  MainClass: net.md_5.specialsource.SpecialSource', est: 25, countAll: true },
            { percent: 80, message: 'Applying: ', est: 1 },
            { percent: 85, message: '    Checksum: ', est: 120 },
            { percent: 90, message: '  Patching ', est: 1000 },
            { percent: 100, message: '[Progress.Stage] Injecting profile', est: 1 }
        ]

        // Forge installer logs are not very useful, so we need to parse them to get a better progress estimate.
        let stage = 0
        let startCount = 0
        let msgCount = 0
        let cliPercent = 0
        function onLog(logChunk: string): void {
            for (const log of logChunk.split('[Forge Installer] ')) {
                if (log.length === 0) continue

                logger.debug(`[Forge Installer] ${log}`)
                msgCount++

                // Progress messages are the most useful, so we can use them to get a better estimate.
                const match = log.match(/\[Progress\] (\d+)/)
                if (match != null) {
                    cliPercent = Number(match[1])
                }
                
                // Find the matching stage.
                const index = stages.findIndex(({ message }) => log.startsWith(message))
                if(index !== -1) {
                    if(index > stage) {
                        // We've moved to the next stage.
                        stage = index
                        startCount = 0
                        msgCount = 0
                        cliPercent = 0
                    } else {
                        // We're still in the same stage, increment the message count.
                        startCount++
                    }
                }

                // Calculate the progress.
                const stageInfo = stages[stage]
                const nextPercent = stageInfo.nextPercent
                    ?? (stage+1 < stages.length ? stages[stage+1] : stageInfo).percent
                // Count all messages in the current stage if countAll is true.
                const estProgress = stageInfo.est
                    ? (stageInfo.countAll ? msgCount : startCount) / stageInfo.est
                    : cliPercent / 100
                const percent = lerp(stageInfo.percent, nextPercent, estProgress)

                onProgress(Math.floor(percent))
            }
        }

        logger.info('[Forge Installer] Starting')
        await new Promise<void>((resolve, reject) => {
            const child = spawn(javaExecPath, ['-jar', wrapperPath, '--installer', installerExecPath, '--target', this.commonDir, '--progress'])
            child.stdout.on('data', (data) => onLog(data.toString('utf8') as string))
            child.stderr.on('data', (data) => onLog(data.toString('utf8') as string))
            child.on('close', (code) => {
                logger.info('[Forge Installer]', 'Exited with code', code)
                if (code === 0) {
                    resolve()
                } else {
                    reject(`Forge Installer exited with code ${code}`)
                }
            })
        })

        // Forge installer generates a version.json in the format: 1.16.5-forge-36.2.39.json
        const [mcVer, forgeVer] = forgeVersion.split('-')
        const srcForgeVersion = `${mcVer}-forge-${forgeVer}`
        const srcForgeManifest = join(this.commonDir, 'versions', srcForgeVersion, `${srcForgeVersion}.json`)
        
        // Rename json if successful.
        await ensureDir(dirname(forgeManifest))
        await copyFile(srcForgeManifest, forgeManifest)
    }

    // TODO Type the return type.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public async loadForgeVersionJson(): Promise<any> {

        const server: HeliosServer = this.distribution.getServerById(this.serverId)!
        if(server == null) {
            throw new AssetGuardError(`Invalid server id ${this.serverId}`)
        }

        const forgeModule = server.modules.find(({ rawModule: { type } }) => type === Type.ForgeHosted || type === Type.Forge)

        if(forgeModule == null) {
            throw new AssetGuardError('No Forge module found!')
        }

        if(DistributionIndexProcessor.isForgeGradle3(server.rawServer.minecraftVersion, forgeModule.getMavenComponents().version)) {

            const versionManifstModule = forgeModule.subModules.find(({ rawModule: { type }}) => type === Type.VersionManifest)
            if(versionManifstModule != null) {
                // For 1.12, the version manifest is in the distribution.json.
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return await readJson(versionManifstModule.getPath(), 'utf-8')
            }

            // Forge version is in the format: 1.16.5-36.2.39.json
            const forgeVersion = forgeModule.getMavenComponents().version
            const forgeManifest = join(this.commonDir, 'versions', forgeVersion, `${forgeVersion}.json`)

            logger.info('Loading forge version json from', forgeManifest)
            // eslint-disable-next-line @typescript-eslint/no-unsafe-return
            return await readJson(forgeManifest, 'utf-8')

        } else {

            const zip = new StreamZip.async({ file: forgeModule.getPath() })

            try {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                const data = JSON.parse((await zip.entryData('version.json')).toString('utf8'))
                const writePath = getVersionJsonPath(this.commonDir, data.id as string)
    
                await ensureDir(dirname(writePath))
                await writeJson(writePath, data)
    
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return
                return data
            }
            finally {
                await zip.close()
            }
            
        }
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