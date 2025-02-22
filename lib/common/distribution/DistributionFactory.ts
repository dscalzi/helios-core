import { Distribution, Server, Module, Type, Required as HeliosRequired, JavaVersionProps, JavaPlatformOptions, Platform, JdkDistribution } from 'helios-distribution-types'
import { MavenComponents, MavenUtil } from '../util/MavenUtil'
import { join } from 'path'
import { LoggerUtil } from '../../util/LoggerUtil'
import { mcVersionAtLeast } from '../util/MojangUtils'

const logger = LoggerUtil.getLogger('DistributionFactory')

export class HeliosDistribution {

    private mainServerIndex!: number

    public readonly servers: HeliosServer[]

    constructor(
        public readonly rawDistribution: Distribution,
        commonDir: string,
        instanceDir: string
    ) {
        this.resolveMainServerIndex()
        this.servers = this.rawDistribution.servers.map(s => new HeliosServer(s, commonDir, instanceDir))
    }

    private resolveMainServerIndex(): void {

        if(this.rawDistribution.servers.length > 0) {
            for(let i=0; i<this.rawDistribution.servers.length; i++) {
                if(this.mainServerIndex == null) {
                    if(this.rawDistribution.servers[i].mainServer) {
                        this.mainServerIndex = i
                    }
                } else {
                    this.rawDistribution.servers[i].mainServer = false
                }
            }
            if(this.mainServerIndex == null) {
                this.mainServerIndex = 0
                this.rawDistribution.servers[this.mainServerIndex].mainServer = true
            }
        } else {
            logger.warn('Distribution has 0 configured servers. This doesnt seem right..')
            this.mainServerIndex = 0
        }
    }

    public getMainServer(): HeliosServer | null {
        return this.mainServerIndex < this.servers.length ? this.servers[this.mainServerIndex] : null
    }

    public getServerById(id: string): HeliosServer | null {
        return this.servers.find(s => s.rawServer.id === id) || null
    }

}

export class HeliosServer {

    public readonly modules: HeliosModule[]
    public readonly hostname: string
    public readonly port: number
    public readonly effectiveJavaOptions: Required<JavaVersionProps>

    constructor(
        public readonly rawServer: Server,
        commonDir: string,
        instanceDir: string
    ) {
        const { hostname, port } = this.parseAddress()
        this.hostname = hostname
        this.port = port
        this.effectiveJavaOptions = this.parseEffectiveJavaOptions()
        this.modules = rawServer.modules.map(m => new HeliosModule(m, rawServer.id, commonDir, instanceDir))
    }

    private parseAddress(): { hostname: string, port: number } {
        // Srv record lookup here if needed.
        if(this.rawServer.address.includes(':')) {
            const pieces = this.rawServer.address.split(':')
            const port = Number(pieces[1])

            if(!Number.isInteger(port)) {
                throw new Error(`Malformed server address for ${this.rawServer.id}. Port must be an integer!`)
            }

            return { hostname: pieces[0], port }
        } else {
            return { hostname: this.rawServer.address, port: 25565 }
        }
    }

    private parseEffectiveJavaOptions(): Required<JavaVersionProps> {

        const options: JavaPlatformOptions[] = this.rawServer.javaOptions?.platformOptions ?? []

        const mergeableProps: JavaVersionProps[] = []
        for(const option of options) {

            if (option.platform === process.platform) {
                if (option.architecture === process.arch) {
                    mergeableProps[0] = option
                } else {
                    mergeableProps[1] = option
                }
            }
        }
        mergeableProps[3] = {
            distribution: this.rawServer.javaOptions?.distribution,
            supported: this.rawServer.javaOptions?.supported,
            suggestedMajor: this.rawServer.javaOptions?.suggestedMajor
        }

        const merged: JavaVersionProps = {}
        for(let i=mergeableProps.length-1; i>=0; i--) {
            if(mergeableProps[i] != null) {
                merged.distribution = mergeableProps[i].distribution
                merged.supported = mergeableProps[i].supported
                merged.suggestedMajor = mergeableProps[i].suggestedMajor
            }
        }

        return this.defaultUndefinedJavaOptions(merged)
    }

    private defaultUndefinedJavaOptions(props: JavaVersionProps): Required<JavaVersionProps> {
        const [defaultRange, defaultSuggestion] = this.defaultJavaVersion()
        return {
            supported: props.supported ?? defaultRange,
            distribution: props.distribution ?? this.defaultJavaPlatform(),
            suggestedMajor: props.suggestedMajor ?? defaultSuggestion,
        }
    }

    private defaultJavaVersion(): [string, number] {
        if(mcVersionAtLeast('1.20.5', this.rawServer.minecraftVersion)) {
            return ['>=21.x', 21]
        } else if(mcVersionAtLeast('1.17', this.rawServer.minecraftVersion)) {
            return ['>=17.x', 17]
        } else {
            return ['8.x', 8]
        }
    }

    private defaultJavaPlatform(): JdkDistribution {
        return process.platform === Platform.DARWIN ? JdkDistribution.CORRETTO : JdkDistribution.TEMURIN
    }
 
}

export class HeliosModule {

    public readonly subModules: HeliosModule[]

    private readonly mavenComponents: Readonly<MavenComponents>
    private readonly required: Readonly<Required<HeliosRequired>>
    private readonly localPath: string

    constructor(
        public readonly rawModule: Module,
        private readonly serverId: string,
        commonDir: string,
        instanceDir: string
    ) {

        this.mavenComponents = this.resolveMavenComponents()
        this.required = this.resolveRequired()
        this.localPath = this.resolveLocalPath(commonDir, instanceDir)

        if(this.rawModule.subModules != null) {
            this.subModules = this.rawModule.subModules.map(m => new HeliosModule(m, serverId, commonDir, instanceDir))
        } else {
            this.subModules = []
        }
        
    }

    private resolveMavenComponents(): MavenComponents {

        // Files need not have a maven identifier if they provide a path.
        if(this.rawModule.type === Type.File && this.rawModule.artifact.path != null) {
            return null! as MavenComponents
        }
        // Version Manifests never provide a maven identifier.
        if(this.rawModule.type === Type.VersionManifest) {
            return null! as MavenComponents
        }

        const isMavenId = MavenUtil.isMavenIdentifier(this.rawModule.id)

        if(!isMavenId) {
            if(this.rawModule.type !== Type.File) {
                throw new Error(`Module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type} must have a valid maven identifier!`)
            } else {
                throw new Error(`Module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type} must either declare an artifact path or have a valid maven identifier!`)
            }
        }

        try {
            return MavenUtil.getMavenComponents(this.rawModule.id)
        } catch(err) {
            throw new Error(`Failed to resolve maven components for module ${this.rawModule.name} (${this.rawModule.id}) of type ${this.rawModule.type}. Reason: ${(err as Error).message}`)
        }
        
    }

    private resolveRequired(): Required<HeliosRequired> {
        if(this.rawModule.required == null) {
            return {
                value: true,
                def: true
            }
        } else {
            return {
                value: this.rawModule.required.value ?? true,
                def: this.rawModule.required.def ?? true
            }
        }
    }

    private resolveLocalPath(commonDir: string, instanceDir: string): string {

        // Version Manifests have a pre-determined path.
        if(this.rawModule.type === Type.VersionManifest) {
            return join(commonDir, 'versions', this.rawModule.id, `${this.rawModule.id}.json`)
        }

        const relativePath = this.rawModule.artifact.path ?? MavenUtil.mavenComponentsAsNormalizedPath(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.version,
            this.mavenComponents.classifier,
            this.mavenComponents.extension
        )

        switch (this.rawModule.type) {
            case Type.Library:
            case Type.Forge:
            case Type.ForgeHosted:
            case Type.Fabric:
            case Type.LiteLoader:
                return join(commonDir, 'libraries', relativePath)
            case Type.ForgeMod:
            case Type.LiteMod:
                // TODO Move to /mods/forge eventually..
                return join(commonDir, 'modstore', relativePath)
            case Type.FabricMod:
                return join(commonDir, 'mods', 'fabric', relativePath)
            case Type.File:
            default:
                return join(instanceDir, this.serverId, relativePath) 
        }
        
    }

    public hasMavenComponents(): boolean {
        return this.mavenComponents != null
    }

    public getMavenComponents(): Readonly<MavenComponents> {
        return this.mavenComponents
    }

    public getRequired(): Readonly<Required<HeliosRequired>> {
        return this.required
    }

    public getPath(): string {
        return this.localPath
    }

    public getMavenIdentifier(): string {
        return MavenUtil.mavenComponentsToIdentifier(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.version,
            this.mavenComponents.classifier,
            this.mavenComponents.extension
        )
    }

    public getExtensionlessMavenIdentifier(): string {
        return MavenUtil.mavenComponentsToExtensionlessIdentifier(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.version,
            this.mavenComponents.classifier
        )
    }

    public getVersionlessMavenIdentifier(): string {
        return MavenUtil.mavenComponentsToVersionlessIdentifier(
            this.mavenComponents.group,
            this.mavenComponents.artifact,
            this.mavenComponents.classifier
        )
    }

    public hasSubModules(): boolean {
        return this.subModules.length > 0
    }

}