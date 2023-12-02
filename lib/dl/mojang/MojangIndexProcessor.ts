import got, { RequestError } from 'got'
import { dirname, join } from 'path'
import { ensureDir, pathExists, readFile, readJson, writeFile } from 'fs-extra'

import { Asset, HashAlgo } from '../Asset'
import { AssetGuardError } from '../AssetGuardError'
import { IndexProcessor } from '../IndexProcessor'
import { AssetIndex, LibraryArtifact, MojangVersionManifest, VersionJsonBase } from './MojangTypes'
import { calculateHashByBuffer, getLibraryDir, getVersionJarPath, getVersionJsonPath, validateLocalFile } from '../../common/util/FileUtils'
import { getMojangOS, isLibraryCompatible } from '../../common/util/MojangUtils'
import { LoggerUtil } from '../../util/LoggerUtil'
import { handleGotError } from '../../common/rest/RestResponse'

export class MojangIndexProcessor extends IndexProcessor {

    public static readonly LAUNCHER_JSON_ENDPOINT = 'https://launchermeta.mojang.com/mc/launcher.json'
    public static readonly VERSION_MANIFEST_ENDPOINT = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
    public static readonly ASSET_RESOURCE_ENDPOINT = 'https://resources.download.minecraft.net'

    private static readonly logger = LoggerUtil.getLogger('MojangIndexProcessor')

    private versionJson!: VersionJsonBase
    private assetIndex!: AssetIndex
    private client = got.extend({
        responseType: 'json'
    })

    private assetPath: string

    constructor(commonDir: string, protected version: string) {
        super(commonDir)
        this.assetPath = join(commonDir, 'assets')
    }

    /**
     * Download https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
     *   Unable to download:
     *     Proceed, check versions directory for target version
     *       If version.json not present, fatal error.
     *       If version.json present, load and use.
     *   Able to download:
     *     Download, use in memory only.
     *     Locate target version entry.
     *     Extract hash
     *     Validate local exists and matches hash
     *       Condition fails: download
     *         Download fails: fatal error
     *         Download succeeds: Save to disk, continue
     *       Passes: load from file
     * 
     * Version JSON in memory
     *   Extract assetIndex
     *     Check that local exists and hash matches
     *       if false, download
     *         download fails: fatal error
     *       if true: load from disk and use
     * 
     * complete init when 3 files are validated and loaded.
     * 
     */
    public async init(): Promise<void> {

        const versionManifest = await this.loadVersionManifest()
        this.versionJson = await this.loadVersionJson(this.version, versionManifest)
        this.assetIndex = await this.loadAssetIndex(this.versionJson)

    }

    // Can be called without init - needed for launch process.
    public async getVersionJson(): Promise<VersionJsonBase> {
        const versionManifest = await this.loadVersionManifest()
        return await this.loadVersionJson(this.version, versionManifest)
    }

    private async loadAssetIndex(versionJson: VersionJsonBase): Promise<AssetIndex> {
        const assetIndexPath = this.getAssetIndexPath(versionJson.assetIndex.id)
        const assetIndex = await this.loadContentWithRemoteFallback<AssetIndex>(versionJson.assetIndex.url, assetIndexPath, { algo: HashAlgo.SHA1, value: versionJson.assetIndex.sha1 })
        if(assetIndex == null) {
            throw new AssetGuardError(`Failed to download ${versionJson.assetIndex.id} asset index.`)
        }
        return assetIndex
    }

    private async loadVersionJson(version: string, versionManifest: MojangVersionManifest | null): Promise<VersionJsonBase> {
        const versionJsonPath = getVersionJsonPath(this.commonDir, version)
        if(versionManifest != null) {
            const versionInfo = versionManifest.versions.find(({ id }) => id === version)
            if(versionInfo == null) {
                throw new AssetGuardError(`Invalid version: ${version}.`)
            }
            const versionJson = await this.loadContentWithRemoteFallback<VersionJsonBase>(versionInfo.url, versionJsonPath, { algo: HashAlgo.SHA1, value: versionInfo.sha1 })
            if(versionJson == null) {
                throw new AssetGuardError(`Failed to download ${version} json index.`)
            }

            return versionJson
            
        } else {
            // Attempt to find local index.
            if(await pathExists(versionJsonPath)) {
                return await readJson(versionJsonPath) as VersionJsonBase
            } else {
                throw new AssetGuardError(`Unable to load version manifest and ${version} json index does not exist locally.`)
            }
        }
    }

    private async loadContentWithRemoteFallback<T>(url: string, path: string, hash?: {algo: string, value: string}): Promise<T | null> {

        try {
            if(await pathExists(path)) {
                const buf = await readFile(path)
                if(hash) {
                    const bufHash = calculateHashByBuffer(buf, hash.algo)
                    if(bufHash === hash.value) {
                        return JSON.parse(buf.toString()) as T
                    }
                } else {
                    return JSON.parse(buf.toString()) as T
                }
            }
        } catch(error) {
            throw new AssetGuardError(`Failure while loading ${path}.`, error as Error)
        }
        
        try {
            const res = await this.client.get<T>(url)

            await ensureDir(dirname(path))
            await writeFile(path, JSON.stringify(res.body))

            return res.body
        } catch(error) {
            return handleGotError(url, error as RequestError, MojangIndexProcessor.logger, () => null).data
        }

    }

    private async loadVersionManifest(): Promise<MojangVersionManifest | null> {
        try {
            const res = await this.client.get<MojangVersionManifest>(MojangIndexProcessor.VERSION_MANIFEST_ENDPOINT)
            return res.body
        } catch(error) {
            return handleGotError('Load Mojang Version Manifest', error as RequestError, MojangIndexProcessor.logger, () => null).data
        }
    }

    private getAssetIndexPath(id: string): string {
        return join(this.assetPath, 'indexes', `${id}.json`)
    }

    public totalStages(): number {
        return 4
    }

    public async validate(onStageComplete: () => Promise<void>): Promise<{[category: string]: Asset[]}> {

        const assets = await this.validateAssets(this.assetIndex)
        await onStageComplete()
        const libraries = await this.validateLibraries(this.versionJson)
        await onStageComplete()
        const client = await this.validateClient(this.versionJson)
        await onStageComplete()
        const logConfig = await this.validateLogConfig(this.versionJson)
        await onStageComplete()

        return {
            assets,
            libraries,
            client,
            misc: [
                ...logConfig
            ]
        }
    }

    public async postDownload(): Promise<void> {
        // no-op
    }

    private async validateAssets(assetIndex: AssetIndex): Promise<Asset[]> {

        const objectDir = join(this.assetPath, 'objects')
        const notValid: Asset[] = []

        for(const assetEntry of Object.entries(assetIndex.objects)) {
            const hash = assetEntry[1].hash
            const path = join(objectDir, hash.substring(0, 2), hash)
            const url = `${MojangIndexProcessor.ASSET_RESOURCE_ENDPOINT}/${hash.substring(0, 2)}/${hash}`

            if(!await validateLocalFile(path, HashAlgo.SHA1, hash)) {
                notValid.push({
                    id: assetEntry[0],
                    hash,
                    algo: HashAlgo.SHA1,
                    size: assetEntry[1].size,
                    url,
                    path
                })
            }
        }

        return notValid

    }

    private async validateLibraries(versionJson: VersionJsonBase): Promise<Asset[]> {
        
        const libDir = getLibraryDir(this.commonDir)
        const notValid: Asset[] = []

        for(const libEntry of versionJson.libraries) {
            if(isLibraryCompatible(libEntry.rules, libEntry.natives)) {
                let artifact: LibraryArtifact
                if(libEntry.natives == null) {
                    artifact = libEntry.downloads.artifact
                } else {
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    const classifier = libEntry.natives[getMojangOS()].replace('${arch}', process.arch.replace('x', '')) as string
                    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                    // @ts-ignore
                    artifact = libEntry.downloads.classifiers[classifier] as LibraryArtifact
                }

                const path = join(libDir, artifact.path)
                const hash = artifact.sha1
                if(!await validateLocalFile(path, HashAlgo.SHA1, hash)) {
                    notValid.push({
                        id: libEntry.name,
                        hash,
                        algo: HashAlgo.SHA1,
                        size: artifact.size,
                        url: artifact.url,
                        path
                    })
                }
            }
        }

        return notValid
    }

    private async validateClient(versionJson: VersionJsonBase): Promise<Asset[]> {

        const version = versionJson.id
        const versionJarPath = getVersionJarPath(this.commonDir, version)
        const hash = versionJson.downloads.client.sha1

        if(!await validateLocalFile(versionJarPath, HashAlgo.SHA1, hash)) {
            return [{
                id: `${version} client`,
                hash,
                algo: HashAlgo.SHA1,
                size: versionJson.downloads.client.size,
                url: versionJson.downloads.client.url,
                path: versionJarPath
            }]
        }

        return []

    }

    private async validateLogConfig(versionJson: VersionJsonBase): Promise<Asset[]> {

        const logFile = versionJson.logging.client.file
        const path = join(this.assetPath, 'log_configs', logFile.id)
        const hash = logFile.sha1

        if(!await validateLocalFile(path, HashAlgo.SHA1, hash)) {
            return [{
                id: logFile.id,
                hash,
                algo: HashAlgo.SHA1,
                size: logFile.size,
                url: logFile.url,
                path
            }]
        }

        return []

    }

}