import { exec } from 'child_process'
import { pathExists, readdir } from 'fs-extra'
import got from 'got'
import { Architecture, JdkDistribution, Platform } from 'helios-distribution-types'
import { dirname, join } from 'path'
import { promisify } from 'util'
import { LauncherJson } from '../model/mojang/LauncherJson'
import { LoggerUtil } from '../util/LoggerUtil'
import Registry from 'winreg'
import semver from 'semver'
import { Asset, HashAlgo } from '../dl'
import { extractTarGz, extractZip } from '../common/util/FileUtils'

const log = LoggerUtil.getLogger('JavaGuard')

export interface JavaVersion {
    major: number
    minor: number
    patch: number
}

export interface AdoptiumJdk {
    binary: {
        architecture: string
        download_count: number
        heap_size: string
        image_type: 'jdk' | 'debugimage' | 'testimage'
        jvm_impl: string
        os: string
        package: {
            checksum: string
            checksum_link: string
            download_count: number
            link: string
            metadata_link: string
            name: string
            size: number
        }
        project: string
        scm_ref: string
        updated_at: string
    }
    release_name: string
    vendor: string
    version: {
        build: number
        major: number
        minor: number
        openjdk_version: string
        security: number
        semver: string
    }
}

// REFERENCE
// awt.toolkit REMOVED IN JDK 9 https://bugs.openjdk.org/browse/JDK-8225358
// file.encoding.pkg REMOVED IN JDK 11 https://bugs.openjdk.org/browse/JDK-8199470 "Package that contains the converters that handle converting between local encodings and Unicode."
// java.awt.graphicsenv REMOVED IN JDK 13 https://bugs.openjdk.org/browse/JDK-8130266
// java.awt.printerjob GONE
// java.endorsed.dirs REMOVED IN JDK 9 (DEPRECATED IN 8 https://docs.oracle.com/javase/8/docs/technotes/guides/standards/)
// java.ext.dirs REMOVED IN JDK 9 https://openjdk.org/jeps/220
// sun.boot.class.path REMOVED IN JDK9 https://openjdk.org/jeps/261
// sun.desktop REMOVED IN JDK13 https://bugs.openjdk.org/browse/JDK-8222814
// user.timezone INITIAL VALUE REMOVED IN JDK 12 https://bugs.openjdk.org/browse/JDK-8213551

/**
 * HotSpot Properties
 * 
 * Obtained via java -XshowSettings:properties -version
 * 
 * https://docs.oracle.com/en/java/javase/17/docs/api/java.base/java/lang/System.html#getProperties()
 * https://docs.oracle.com/javase/tutorial/essential/environment/sysprop.html
 * https://docs.oracle.com/javame/config/cdc/cdc-opt-impl/ojmeec/1.1/architecture/html/properties.htm
 */
export interface HotSpotSettings {
    /**
     * Character encoding for the default locale.
     */
    'file.encoding': string
    /**
     * Character that separates components of a file path. This is "/" on UNIX and "\" on Windows.
     */
    'file.separator': string
    /**
     * Path used to find directories and JAR archives containing class files. Elements of the class path are separated by a platform-specific character specified in the path.separator property.
     * This will be blank on -XshowSettings for obvious reasons.
     */
    'java.class.path': string
    /**
     * Java class format version number.
     * Read as string, actually a number.
     */
    'java.class.version': string
    /**
     * Java installation directory (in 8, the path to the bundled JRE if using the JDK).
     */
    'java.home': string
    /**
     * Default temp file path.
     */
    'java.io.tmpdir': string
    /**
     * List of paths to search when loading libraries.
     */
    'java.library.path': string[]
    /**
     * Runtime Name *Undocumented*
     * https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/lang/VersionProps.java.template#L105
     */
    'java.runtime.name': string
    /**
     * Runtime Version *Undocumented*
     * https://github.com/openjdk/jdk/blob/master/src/java.base/share/classes/java/lang/VersionProps.java.template#L104
     * Ex. 17: 17.0.5+8; 8: 1.8.0_352-b08
     */
    'java.runtime.version': string
    /**
     * Undefined for the initial release. Indicates the runtime implements a revised version of the specification.
     * https://bugs.openjdk.org/browse/JDK-8286766
     */
    'java.specification.maintenance.version'?: string
    /**
     * Java Runtime Environment specification name.
     */
    'java.specification.name': string
    /**
     * Java Runtime Environment specification vendor.
     */
    'java.specification.vendor': string
    /**
     * Java Runtime Environment specification version, whose value is the feature element of the runtime version
     * 
     * Ex. 17: 17; 8: 1.8
     */
    'java.specification.version': string
    /**
     * Java Runtime Environment vendor
     */
    'java.vendor': string
    /**
     * Java vendor URL
     */
    'java.vendor.url': string
    /**
     * Java vendor bug report URL *Undocumented* (but standard)
     */
    'java.vendor.url.bug': string
    /**
     * Java vendor version (optional)
     * JDK 10+
     * https://openjdk.org/jeps/322
     */
    'java.vendor.version'?: string
    /**
     * Java Runtime Environment version
     * Ex. 17: 17.0.5; 8: 1.8.0_352
     */
    'java.version': string
    /**
     * Java Runtime Environment version date, in ISO-8601 YYYY-MM-DD format.
     * JDK 10+
     * https://openjdk.org/jeps/322
     */
    'java.version.date'?: string
    /**
     * Internal flag, Compressed Oop Mode the VM is running in (for JDK internal tests).
     * JDK 9+
     * https://bugs.openjdk.org/browse/JDK-8064457
     */
    'java.vm.compressedOopsMode'?: string
    /**
     * No summary information available, part of the JDK for a very long time.
     */
    'java.vm.info': string
    /**
     * Java Virtual Machine implementation name.
     */
    'java.vm.name': string
    /**
     * 	Java Runtime Environment specification name.
     */
    'java.vm.specification.name': string
    /**
     * Java Runtime Environment specification vendor.
     */
    'java.vm.specification.vendor': string
    /**
     * Java Virtual Machine specification version, whose value is the feature element of the runtime version.
     * 
     * Ex. 17: 17; 8: 1.8
     */
    'java.vm.specification.version': string
    /**
     * Java Virtual Machine implementation vendor.
     */
    'java.vm.vendor': string
    /**
     * Java Virtual Machine implementation version.
     * Ex. 17: 17.0.5+8; 8: 25.352-b08
     */
    'java.vm.version': string
    /**
     * Probably an internal flag, don't use. On 17, not 8.
     */
    'jdk.debug'?: string
    /**
     * Line separator ("\n" on UNIX, "\r \n" on Windows)
     */
    'line.separator': string
    /**
     * Character encoding name derived from the host environment and/or the user's settings. Setting this system property has no effect.
     * https://openjdk.org/jeps/400
     * JDK 17+
     */
    'native.encoding'?: string
    /**
     * Operating system architecture.
     */
    'os.arch': string
    /**
     * Operating system name.
     */
    'os.name': string
    /**
     * Operating system version.
     * Looks like this can be parsed as a number.
     */
    'os.version': string
    /**
     * 	Path separator (":" on UNIX, ";" on Windows)
     */
    'path.separator': string
    /**
     * Platform word size. Examples: "32", "64", "unknown"
     */
    'sun.arch.data.model': string
    /**
     * From here, the VM loads VM libraries (like those related to JVMTI) and any libraries needed for classes on the bootclasspath. Read-only property.
     */
    'sun.boot.library.path': string
    /**
     * Endianess of CPU, "little" or "big".
     */
    'sun.cpu.endian': string
    /**
     * The names of the native instruction sets executable on this platform.
     */
    'sun.cpu.isalist': string
    /**
     * Platform-specific, follows sun.cpu.endian, for example "UnicodeLittle".
     */
    'sun.io.unicode.encoding': string
    /**
     * Internal, used to determine if java process came from a known launcher.
     * Ex. https://github.com/openjdk/jdk/blob/master/src/java.desktop/windows/classes/sun/java2d/windows/WindowsFlags.java#L86
     */
    'sun.java.launcher': string
    /**
     * Encoding used to interpret platform strings.
     * https://happygiraffe.net/2009/09/24/java-platform-encoding/
     */
    'sun.jnu.encoding': string
    /**
     * Tiered, client, or server
     * https://stackoverflow.com/questions/14818584/which-java-hotspot-jit-compiler-is-running
     */
    'sun.management.compiler': string
    /**
     * Internal
     */
    'sun.os.patch.level': string
    /**
     * Internal
     */
    'sun.stderr.encoding': string
    /**
     * Internal
     */
    'sun.stdout.encoding': string
    /**
     * Country (system dependent).
     */
    'user.country': string
    /**
     * User's current working directory.
     */
    'user.dir': string
    /**
     * 	User's home directory.
     */
    'user.home': string
    /**
     * Two-letter language code of the default locale (system dependent).
     */
    'user.language': string
    /**
     * User's account name.
     */
    'user.name': string
    /**
     * User specified script.
     * https://bugs.openjdk.org/browse/JDK-6990452
     */
    'user.script': string
    /**
     * Variant (more specific than country and language).
     */
    'user.variant': string
}

/**
 * Get the target JDK's properties. Only HotSpot VMs are officially
 * supported, as properties may change between VMs. Usage of internal
 * properties should be avoided.
 * 
 * @param execPath The path to the Java executable. 
 * @returns The parsed HotSpot VM properties.
 */
export async function getHotSpotSettings(execPath: string): Promise<HotSpotSettings | null> {

    const javaExecutable = execPath.includes('javaw.exe') ? execPath.replace('javaw.exe', 'java.exe') : execPath

    if(!await pathExists(execPath)) {
        log.warn(`Candidate JVM path does not exist, skipping. ${execPath}`)
        return null
    }

    const execAsync = promisify(exec)

    let stderr
    try {
        stderr = (await execAsync(`"${javaExecutable}" -XshowSettings:properties -version`)).stderr
    } catch(error) {
        log.error(`Failed to resolve JVM settings for '${execPath}'`)
        log.error(error)
        return null
    }
    

    const listProps = [
        'java.library.path'
    ]

    const ret: Record<string, unknown> = {}

    const split = stderr.split('\n')
    let lastProp: string = null!
    for(const prop of split) {
        if(prop.startsWith('        ')) {
            // Add to previous prop.
            if(!Array.isArray(ret[lastProp])) {
                ret[lastProp] = [ret[lastProp]]
            }
            (ret[lastProp] as unknown[]).push(prop.trim())
        }
        else if(prop.startsWith('    ')) {
            const tmp = prop.split('=')
            const key = tmp[0].trim()
            const val = tmp[1].trim()

            ret[key] = val
            lastProp = key
        }
    }

    for(const key of listProps) {
        if(ret[key] != null && !Array.isArray(ret[key])) {
            ret[key] = [ret[key]]
        }
    }

    return ret as unknown as HotSpotSettings
}

export async function resolveJvmSettings(paths: string[]): Promise<{ [path: string]: HotSpotSettings }> {

    const ret: { [path: string]: HotSpotSettings } = {}

    for(const path of paths) {
        const settings = await getHotSpotSettings(javaExecFromRoot(path))
        if(settings != null) {
            ret[path] = settings
        } else {
            log.warn(`Skipping invalid JVM candidate: ${path}`)
        }
    }

    return ret
}

export interface JvmDetails {
    semver: JavaVersion
    semverStr: string
    vendor: string
    path: string
}

export function filterApplicableJavaPaths(resolvedSettings: { [path: string]: HotSpotSettings }, semverRange: string): JvmDetails[] {

    const arm = process.arch === Architecture.ARM64

    const jvmDetailsUnfiltered = Object.entries(resolvedSettings)
        .filter(([, settings ]) => parseInt(settings['sun.arch.data.model']) === 64) // Only allow 64-bit.
        .filter(([, settings ]) => arm ? settings['os.arch'] === 'aarch64' : true) // Only allow arm on arm architecture (disallow rosetta on m2 mac)
        .map(([ path, settings ]) => {
            const parsedVersion = parseJavaRuntimeVersion(settings['java.version'])
            if(parsedVersion == null) {
                log.error(`Failed to parse JDK version at location '${path}' (Vendor: ${settings['java.vendor']})`)
                return null!
            }
            return {
                semver: parsedVersion,
                semverStr: javaVersionToString(parsedVersion),
                vendor: settings['java.vendor'],
                path
            }
        })
        .filter(x => x != null)

    // Now filter by options.
    const jvmDetails = jvmDetailsUnfiltered
        .filter(details => semver.satisfies(details.semverStr, semverRange))

    return jvmDetails
}

export function rankApplicableJvms(details: JvmDetails[]): void {
    details.sort((a, b) => {

        if(a.semver.major === b.semver.major){
            if(a.semver.minor === b.semver.minor){
                if(a.semver.patch === b.semver.patch){

                    // Same version, give priority to JRE.
                    if(a.path.toLowerCase().includes('jdk')){
                        return b.path.toLowerCase().includes('jdk') ? 0 : 1
                    } else {
                        return -1
                    }

                } else {
                    return (a.semver.patch - b.semver.patch)*-1
                }
            } else {
                return (a.semver.minor - b.semver.minor)*-1
            }
        } else {
            return (a.semver.major - b.semver.major)*-1
        }
    })
}

// Used to discover the best installation.
export async function discoverBestJvmInstallation(dataDir: string, semverRange: string): Promise<JvmDetails | null> {

    // Get candidates, filter duplicates out.
    const paths = [...new Set<string>(await getValidatableJavaPaths(dataDir))]

    // Get VM settings.
    const resolvedSettings = await resolveJvmSettings(paths)

    // Filter
    const jvmDetails = filterApplicableJavaPaths(resolvedSettings, semverRange)

    // Rank
    rankApplicableJvms(jvmDetails)

    return jvmDetails.length > 0 ? jvmDetails[0] : null
}

// Used to validate the selected jvm.
export async function validateSelectedJvm(path: string, semverRange: string): Promise<JvmDetails | null> {

    if(!await pathExists(path)) {
        return null
    }

    // Get VM settings.
    const resolvedSettings = await resolveJvmSettings([path])

    // Filter
    const jvmDetails = filterApplicableJavaPaths(resolvedSettings, semverRange)

    // Rank
    rankApplicableJvms(jvmDetails)

    return jvmDetails.length > 0 ? jvmDetails[0] : null
}

/**
 * Fetch the last open JDK binary.
 * 
 * HOTFIX: Uses Corretto 8 for macOS.
 * See: https://github.com/dscalzi/HeliosLauncher/issues/70
 * See: https://github.com/AdoptOpenJDK/openjdk-support/issues/101
 * 
 * @param {number} major The major version of Java to fetch.
 * 
 * @returns {Promise.<RemoteJdkDistribution | null>} Promise which resolved to an object containing the JDK download data.
 */
export async function latestOpenJDK(major: number, dataDir: string, distribution?: JdkDistribution): Promise<Asset | null> {

    if(distribution == null) {
        // If no distribution is specified, use Corretto on macOS and Temurin for all else.
        if(process.platform === Platform.DARWIN) {
            return latestCorretto(major, dataDir)
        } else {
            return latestAdoptium(major, dataDir)
        }
    } else {
        // Respect the preferred distribution.
        switch(distribution) {
            case JdkDistribution.TEMURIN:
                return latestAdoptium(major, dataDir)
            case JdkDistribution.CORRETTO:
                return latestCorretto(major, dataDir)
            default: {
                const eMsg = `Unknown distribution '${distribution}'`
                log.error(eMsg)
                throw new Error(eMsg)
            }
        }
    }
}

export async function latestAdoptium(major: number, dataDir: string): Promise<Asset | null> {

    const sanitizedOS = process.platform === Platform.WIN32 ? 'windows' : (process.platform === Platform.DARWIN ? 'mac' : process.platform)
    const arch: string = process.arch === Architecture.ARM64 ? 'aarch64' : Architecture.X64
    const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?vendor=eclipse`

    try {
        const res = await got.get<AdoptiumJdk[]>(url, { responseType: 'json' })
        if(res.body.length > 0) {
            const targetBinary = res.body.find(entry => {
                return entry.version.major === major
                    && entry.binary.os === sanitizedOS
                    && entry.binary.image_type === 'jdk'
                    && entry.binary.architecture === arch
            })

            if(targetBinary != null) {
                return {
                    url: targetBinary.binary.package.link,
                    size: targetBinary.binary.package.size,
                    id: targetBinary.binary.package.name,
                    hash: targetBinary.binary.package.checksum,
                    algo: HashAlgo.SHA256,
                    path: join(getLauncherRuntimeDir(dataDir), targetBinary.binary.package.name)
                }
            } else {
                log.error(`Failed to find a suitable Adoptium binary for JDK ${major} (${sanitizedOS} ${arch}).`)
                return null
            }
        } else {
            log.error(`Adoptium returned no results for JDK ${major}.`)
            return null
        }

    } catch(err) {
        log.error(`Error while retrieving latest Adoptium JDK ${major} binaries.`, err)
        return null
    }
}

export async function latestCorretto(major: number, dataDir: string): Promise<Asset | null> {

    let sanitizedOS: string, ext: string
    const arch = process.arch === Architecture.ARM64 ? 'aarch64' : Architecture.X64

    switch(process.platform) {
        case Platform.WIN32:
            sanitizedOS = 'windows'
            ext = 'zip'
            break
        case Platform.DARWIN:
            sanitizedOS = 'macos'
            ext = 'tar.gz'
            break
        case Platform.LINUX:
            sanitizedOS = 'linux'
            ext = 'tar.gz'
            break
        default:
            sanitizedOS = process.platform
            ext = 'tar.gz'
            break
    }

    const url = `https://corretto.aws/downloads/latest/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`
    const md5url = `https://corretto.aws/downloads/latest_checksum/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`
    try {
        const res = await got.head(url)
        const checksum = await got.get(md5url)
        if(res.statusCode === 200) {
            const name = url.substring(url.lastIndexOf('/')+1)
            return {
                url: url,
                size: parseInt(res.headers['content-length']!),
                id: name,
                hash: checksum.body,
                algo: HashAlgo.MD5,
                path: join(getLauncherRuntimeDir(dataDir), name)
            }
        } else {
            log.error(`Error while retrieving latest Corretto JDK ${major} (${sanitizedOS} ${arch}): ${res.statusCode} ${res.statusMessage ?? ''}`)
            return null
        }
    } catch(err) {
        log.error(`Error while retrieving latest Corretto JDK ${major} (${sanitizedOS} ${arch}).`, err)
        return null
    }
}

export async function extractJdk(archivePath: string): Promise<string> {
    let javaExecPath: string = null!
    if(archivePath.endsWith('zip')) {
        await extractZip(archivePath, async zip => {
            const entries = await zip.entries()
            javaExecPath = javaExecFromRoot(join(dirname(archivePath), Object.keys(entries)[0]))
        })
    }
    else {
        await extractTarGz(archivePath, header => {
            // Get the first
            if(javaExecPath == null) {
                let h = header.name
                if(h.includes('/')){
                    h = h.substring(0, h.indexOf('/'))
                }
                javaExecPath = javaExecFromRoot(join(dirname(archivePath), h))
            }
        })
    }

    return javaExecPath
}

/**
 * Returns the path of the OS-specific executable for the given Java
 * installation. Supported OS's are win32, darwin, linux.
 * 
 * @param {string} rootDir The root directory of the Java installation.
 * @returns {string} The path to the Java executable.
 */
export function javaExecFromRoot(rootDir: string): string {
    switch(process.platform) {
        case Platform.WIN32:
            return join(rootDir, 'bin', 'javaw.exe')
        case Platform.DARWIN:
            return join(rootDir, 'Contents', 'Home', 'bin', 'java')
        case Platform.LINUX:
            return join(rootDir, 'bin', 'java')
        default:
            return rootDir
    }
}

/**
 * Given a Java path, ensure it points to the root.
 * 
 * @param dir The untested path.
 * @returns The root java path.
 */
export function ensureJavaDirIsRoot(dir: string): string {
    switch(process.platform) {
        case Platform.DARWIN: {
            const index = dir.indexOf('/Contents/Home')
            return index > -1 ? dir.substring(0, index) : dir
        }
        case Platform.WIN32:
        case Platform.LINUX:
        default: {
            const index = dir.indexOf(join('/', 'bin', 'java'))
            return index > -1 ? dir.substring(0, index) : dir
        }
    }
}

/**
 * Check to see if the given path points to a Java executable.
 * 
 * @param {string} pth The path to check against.
 * @returns {boolean} True if the path points to a Java executable, otherwise false.
 */
export function isJavaExecPath(pth: string): boolean {
    switch(process.platform) {
        case Platform.WIN32:
            return pth.endsWith(join('bin', 'javaw.exe'))
        case Platform.DARWIN:
        case Platform.LINUX:
            return pth.endsWith(join('bin', 'java'))
        default:
            return false
    }
}

// TODO Move this
/**
 * Load Mojang's launcher.json file.
 * 
 * @returns {Promise.<Object>} Promise which resolves to Mojang's launcher.json object.
 */
export async function loadMojangLauncherData(): Promise<LauncherJson | null> {

    try {
        const res = await got.get<LauncherJson>('https://launchermeta.mojang.com/mc/launcher.json', { responseType: 'json' })
        return res.body
    } catch(err) {
        log.error('Failed to retrieve Mojang\'s launcher.json file.')
        return null
    }
}

/**
 * Parses a full Java Runtime version string and resolves
 * the version information. Dynamically detects the formatting
 * to use.
 * 
 * @param {string} verString Full version string to parse.
 * @returns Object containing the version information.
 */
export function parseJavaRuntimeVersion(verString: string): JavaVersion | null {
    if(verString.startsWith('1.')){
        return parseJavaRuntimeVersionLegacy(verString)
    } else {
        return parseJavaRuntimeVersionSemver(verString)
    }
}

/**
 * Parses a full Java Runtime version string and resolves
 * the version information. Uses Java 8 formatting.
 * 
 * @param {string} verString Full version string to parse.
 * @returns Object containing the version information.
 */
export function  parseJavaRuntimeVersionLegacy(verString: string): JavaVersion | null {
    // 1.{major}.0_{update}-b{build}
    // ex. 1.8.0_152-b16
    const regex = /1.(\d+).(\d+)_(\d+)(?:-b(\d+))?/
    const match = regex.exec(verString)!

    if(match == null) {
        log.error(`Failed to parse legacy Java version: ${verString}`)
        return null
    }

    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
    }
}

/**
 * Parses a full Java Runtime version string and resolves
 * the version information. Uses Java 9+ formatting.
 * 
 * @param {string} verString Full version string to parse.
 * @returns Object containing the version information.
 */
export function  parseJavaRuntimeVersionSemver(verString: string): JavaVersion | null {
    // {major}.{minor}.{patch}+{build}
    // ex. 10.0.2+13 or 10.0.2.13
    const regex = /(\d+)\.(\d+).(\d+)(?:[+.](\d+))?/
    const match = regex.exec(verString)!

    if(match == null) {
        log.error(`Failed to parse semver Java version: ${verString}`)
        return null
    }

    return {
        major: parseInt(match[1]),
        minor: parseInt(match[2]),
        patch: parseInt(match[3])
    }
}

export function javaVersionToString({ major, minor, patch }: JavaVersion): string {
    return `${major}.${minor}.${patch}`
}

export interface JavaDiscoverer {

    discover(): Promise<string[]>

}

export class PathBasedJavaDiscoverer implements JavaDiscoverer {

    constructor(
        protected paths: string[]
    ) {}

    public async discover(): Promise<string[]> {

        const res = new Set<string>()

        for(const path of this.paths) {
            if(await pathExists(javaExecFromRoot(path))) {
                res.add(path)
            }
        }

        return [...res]
    }
}

export class DirectoryBasedJavaDiscoverer implements JavaDiscoverer {

    constructor(
        protected directories: string[]
    ) {}

    public async discover(): Promise<string[]> {

        const res = new Set<string>()

        for(const directory of this.directories) {

            if(await pathExists(directory)) {
                const files = await readdir(directory)
                for(const file of files) {
                    const fullPath = join(directory, file)
                    
                    if(await pathExists(javaExecFromRoot(fullPath))) {
                        res.add(fullPath)
                    }
                }
            }
        }

        return [...res]
    }
}

export class EnvironmentBasedJavaDiscoverer implements JavaDiscoverer {

    constructor(
        protected keys: string[]
    ) {}

    public async discover(): Promise<string[]> {

        const res = new Set<string>()

        for(const key of this.keys) {

            const value = process.env[key]
            if(value != null) {
                const asRoot = ensureJavaDirIsRoot(value)
                if(await pathExists(asRoot)) {
                    res.add(asRoot)
                }
            }
        }

        return [...res]
    }
}

export class Win32RegistryJavaDiscoverer implements JavaDiscoverer {

    public discover(): Promise<string[]> {

        return new Promise((resolve) => {

            const regKeys = [
                '\\SOFTWARE\\JavaSoft\\Java Runtime Environment', // Java 8 and prior
                '\\SOFTWARE\\JavaSoft\\Java Development Kit',     // Java 8 and prior
                '\\SOFTWARE\\JavaSoft\\JRE',                      // Java 9+
                '\\SOFTWARE\\JavaSoft\\JDK'                       // Java 9+
            ]

            let keysDone = 0

            const candidates = new Set<string>()

            // eslint-disable-next-line @typescript-eslint/prefer-for-of
            for(let i=0; i<regKeys.length; i++){
                const key = new Registry({
                    hive: Registry.HKLM,
                    key: regKeys[i],
                    arch: 'x64'
                })
                key.keyExists((err, exists) => {
                    if(exists) {
                        key.keys((err, javaVers) => {
                            if(err){
                                keysDone++
                                console.error(err)

                                // REG KEY DONE
                                // DUE TO ERROR
                                if(keysDone === regKeys.length){
                                    resolve([...candidates])
                                }
                            } else {
                                if(javaVers.length === 0){
                                    // REG KEY DONE
                                    // NO SUBKEYS
                                    keysDone++
                                    if(keysDone === regKeys.length){
                                        resolve([...candidates])
                                    }
                                } else {

                                    let numDone = 0

                                    // eslint-disable-next-line @typescript-eslint/prefer-for-of
                                    for(let j=0; j<javaVers.length; j++){
                                        const javaVer = javaVers[j]
                                        const vKey = javaVer.key.substring(javaVer.key.lastIndexOf('\\')+1).trim()

                                        let major = -1
                                        if(vKey.length > 0) {
                                            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
                                            if(isNaN(vKey as any)) {
                                                // Should be a semver key.
                                                major = parseJavaRuntimeVersion(vKey)?.major ?? -1
                                            } else {
                                                // This is an abbreviated version, ie 1.8 or 17.
                                                const asNum = parseFloat(vKey)
                                                if(asNum < 2) {
                                                    // 1.x
                                                    major = asNum % 1 * 10
                                                } else {
                                                    major = asNum
                                                }
                                            }
                                        }

                                        if(major > -1) {
                                            javaVer.get('JavaHome', (err, res) => {
                                                const jHome = res.value
                                                // Exclude 32bit.
                                                if(!jHome.includes('(x86)')){
                                                    candidates.add(jHome)
                                                }
    
                                                // SUBKEY DONE
    
                                                numDone++
                                                if(numDone === javaVers.length){
                                                    keysDone++
                                                    if(keysDone === regKeys.length){
                                                        resolve([...candidates])
                                                    }
                                                }
                                            })
                                        } else {

                                            // SUBKEY DONE
                                            // MAJOR VERSION UNPARSEABLE
                                                
                                            numDone++
                                            if(numDone === javaVers.length){
                                                keysDone++
                                                if(keysDone === regKeys.length){
                                                    resolve([...candidates])
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        })
                    } else {

                        // REG KEY DONE
                        // DUE TO NON-EXISTANCE

                        keysDone++
                        if(keysDone === regKeys.length){
                            resolve([...candidates])
                        }
                    }
                })
            }

        })

    }
}



export async function getValidatableJavaPaths(dataDir: string): Promise<string[]> {
    let discoverers: JavaDiscoverer[]
    switch(process.platform) {
        case Platform.WIN32:
            discoverers = await getWin32Discoverers(dataDir)
            break
        case Platform.DARWIN:
            discoverers = await getDarwinDiscoverers(dataDir)
            break
        case Platform.LINUX:
            discoverers = await getLinuxDiscoverers(dataDir)
            break
        default:
            discoverers = []
            log.warn(`Unable to discover Java paths on platform: ${process.platform}`)
    }

    let paths: string[] = []
    for(const discover of discoverers) {
        paths = [
            ...paths,
            ...await discover.discover()
        ]
    }

    return [...(new Set<string>(paths))]
}

export async function getWin32Discoverers(dataDir: string): Promise<JavaDiscoverer[]> {
    return [
        new EnvironmentBasedJavaDiscoverer(getPossibleJavaEnvs()),
        new DirectoryBasedJavaDiscoverer([
            ...(await getPathsOnAllDrivesWin32([
                'Program Files\\Java',
                'Program Files\\Eclipse Adoptium',
                'Program Files\\Eclipse Foundation',
                'Program Files\\AdoptOpenJDK',
                'Program Files\\Amazon Corretto'
            ])),
            getLauncherRuntimeDir(dataDir)
        ]),
        new Win32RegistryJavaDiscoverer()
    ]
}

export async function getDarwinDiscoverers(dataDir: string): Promise<JavaDiscoverer[]> {
    return [
        new EnvironmentBasedJavaDiscoverer(getPossibleJavaEnvs()),
        new DirectoryBasedJavaDiscoverer([
            '/Library/Java/JavaVirtualMachines',
            getLauncherRuntimeDir(dataDir)
        ]),
        new PathBasedJavaDiscoverer([
            '/Library/Internet Plug-Ins/JavaAppletPlugin.plugin' // /Library/Internet Plug-Ins/JavaAppletPlugin.plugin/Contents/Home/bin/java
        ])
        
    ]
}

export async function getLinuxDiscoverers(dataDir: string): Promise<JavaDiscoverer[]> {
    return [
        new EnvironmentBasedJavaDiscoverer(getPossibleJavaEnvs()),
        new DirectoryBasedJavaDiscoverer([
            '/usr/lib/jvm',
            getLauncherRuntimeDir(dataDir)
        ])
    ]
}

export async function win32DriveMounts(): Promise<string[]> {

    const execAsync = promisify(exec)

    let stdout
    try {
        stdout = (await execAsync('gdr -psp FileSystem | select -eXp root | ConvertTo-Json', {shell: 'powershell.exe'})).stdout
    } catch(error) {
        log.error('Failed to resolve drive mounts!')
        log.error(error)
        // Default to C:\\
        return ['C:\\']
    }

    return JSON.parse(stdout) as string[]
}

export async function getPathsOnAllDrivesWin32(paths: string[]): Promise<string[]> {
    const driveMounts = await win32DriveMounts()
    const res: string[] = []
    for(const path of paths) {
        for(const mount of driveMounts) {
            res.push(join(mount, path))
        }
    }
    return res
}

export function getPossibleJavaEnvs(): string[] {
    return [
        'JAVA_HOME',
        'JRE_HOME',
        'JDK_HOME'
    ]
}

export function getLauncherRuntimeDir(dataDir: string): string {
    return join(dataDir, 'runtime', process.arch)
}