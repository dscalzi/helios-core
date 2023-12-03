export interface Rule {
    action: string
    os?: {
        name: string
        version?: string
    }
    features?: {
        [key: string]: boolean
    }
}

export interface Natives {
    linux?: string
    osx?: string
    windows?: string
}

export interface BaseArtifact {

    sha1: string
    size: number
    url: string

}

export interface LibraryArtifact extends BaseArtifact {

    path: string

}

export interface Library {
    downloads: {
        artifact: LibraryArtifact
        classifiers?: {
            javadoc?: LibraryArtifact
            'natives-linux'?: LibraryArtifact
            'natives-macos'?: LibraryArtifact
            'natives-windows'?: LibraryArtifact
            sources?: LibraryArtifact
        }
    }
    extract?: {
        exclude: string[]
    }
    name: string
    natives?: Natives
    rules?: Rule[]
}

export interface VersionJsonBase {

    assetIndex: {
        id: string
        sha1: string
        size: number
        totalSize: number
        url: string
    }
    assets: string
    downloads: {
        client: BaseArtifact
        server: BaseArtifact
    }
    id: string
    /**
     * Only on modloader version properties (extend and override base version)
     */
    inheritsFrom?: string
    libraries: Library[]
    logging: {
        client: {
            argument: string
            file: {
                id: string
                sha1: string
                size: number
                url: string
            }
            type: string
        }
    }
    mainClass: string
    releaseTime: string
    time: string
    type: string
}

export interface VersionJsonLegacy extends VersionJsonBase {
    minecraftArguments: string
}

export interface VersionJsonNew extends VersionJsonBase {
    arguments: {
        game: (string | RuleBasedArgument)[]
        jvm: (string | RuleBasedArgument)[]
    }
}

export interface RuleBasedArgument {
    rules: Rule[]
    value: string | string[]
}

export interface AssetIndex {

    objects: {
        [file: string]: {
            hash: string
            size: number
        }
    }

}

// v2 spec https://piston-meta.mojang.com/mc/game/version_manifest_v2.json
export interface MojangVersionManifest {

    latest: {
        release: string
        snapshot: string
    }
    versions: {
        id: string
        type: string
        url: string
        time: string
        releaseTime: string
        sha1: string
        complianceLevel: number
    }[]

}

export interface LauncherJava {
    sha1: string
    url: string
    version: string
}

export interface LauncherVersions {
    launcher: {
        commit: string
        name: string
    }
}

export interface LauncherJson {

    java: {
        lzma: {
            sha1: string
            url: string
        }
        sha1: string
    }
    linux: {
        applink: string
        downloadhash: string
        versions: LauncherVersions
    }
    osx: {
        '64': {
            jdk: LauncherJava
            jre: LauncherJava
        }
        apphash: string
        applink: string
        downloadhash: string
        versions: LauncherVersions
    }
    windows: {
        '32': {
            jdk: LauncherJava
            jre: LauncherJava
        }
        '64': {
            jdk: LauncherJava
            jre: LauncherJava
        }
        apphash: string
        applink: string
        downloadhash: string
        rolloutPercent: number
        versions: LauncherVersions
    }

}