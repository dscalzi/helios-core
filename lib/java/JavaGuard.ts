// Commented out for now, focusing on something else.
// import got from 'got'
// import { Architecture, JavaVersion, JdkDistribution, Platform } from 'helios-distribution-types'
// import { join } from 'path'
// import { LauncherJson } from '../model/mojang/LauncherJson'
// import { LoggerUtil } from '../util/LoggerUtil'

// const logger = LoggerUtil.getLogger('JavaGuard')

// export interface RemoteJdkDistribution {
//     uri: string
//     size: number
//     name: string
// }

// export interface AdoptiumJdk {
//     binary: {
//         architecture: string
//         download_count: number
//         heap_size: string
//         image_type: 'jdk' | 'debugimage' | 'testimage'
//         jvm_impl: string
//         os: string
//         package: {
//             checksum: string
//             checksum_link: string
//             download_count: number
//             link: string
//             metadata_link: string
//             name: string
//             size: number
//         }
//         project: string
//         scm_ref: string
//         updated_at: string
//     }
//     release_name: string
//     vendor: string
//     version: {
//         build: number
//         major: number
//         minor: number
//         openjdk_version: string
//         security: number
//         semver: string
//     }
// }

// /**
//  * Fetch the last open JDK binary.
//  * 
//  * HOTFIX: Uses Corretto 8 for macOS.
//  * See: https://github.com/dscalzi/HeliosLauncher/issues/70
//  * See: https://github.com/AdoptOpenJDK/openjdk-support/issues/101
//  * 
//  * @param {number} major The major version of Java to fetch.
//  * 
//  * @returns {Promise.<RemoteJdkDistribution | null>} Promise which resolved to an object containing the JDK download data.
//  */
// export async function latestOpenJDK(major: number, distribution?: JdkDistribution): Promise<RemoteJdkDistribution | null> {

//     if(distribution == null) {
//         // If no distribution is specified, use Corretto on macOS and Temurin for all else.
//         if(process.platform === Platform.DARWIN) {
//             return latestCorretto(major)
//         } else {
//             return latestAdoptium(major)
//         }
//     } else {
//         // Respect the preferred distribution.
//         switch(distribution) {
//             case JdkDistribution.TEMURIN:
//                 return latestAdoptium(major)
//             case JdkDistribution.CORRETTO:
//                 return latestCorretto(major)
//             default: {
//                 const eMsg = `Unknown distribution '${distribution}'`
//                 logger.error(eMsg)
//                 throw new Error(eMsg)
//             }
//         }
//     }
// }

// export async function latestAdoptium(major: number): Promise<RemoteJdkDistribution | null> {

//     const sanitizedOS = process.platform === Platform.WIN32 ? 'windows' : (process.platform === Platform.DARWIN ? 'mac' : process.platform)
//     const arch = process.arch === Architecture.ARM64 ? 'aarch64' : Architecture.X64
//     const url = `https://api.adoptium.net/v3/assets/latest/${major}/hotspot?vendor=eclipse`

//     try {
//         const res = await got.get<AdoptiumJdk[]>(url, { responseType: 'json' })
//         if(res.body.length > 0) {
//             const targetBinary = res.body.find(entry => {
//                 return entry.version.major === major
//                     && entry.binary.os === sanitizedOS
//                     && entry.binary.image_type === 'jdk'
//                     && entry.binary.architecture === arch
//             })

//             if(targetBinary != null) {
//                 return {
//                     uri: targetBinary.binary.package.link,
//                     size: targetBinary.binary.package.size,
//                     name: targetBinary.binary.package.name
//                 }
//             } else {
//                 logger.error(`Failed to find a suitable Adoptium binary for JDK ${major} (${sanitizedOS} ${arch}).`)
//                 return null
//             }
//         } else {
//             logger.error(`Adoptium returned no results for JDK ${major}.`)
//             return null
//         }

//     } catch(err) {
//         logger.error(`Error while retrieving latest Adoptium JDK ${major} binaries.`, err)
//         return null
//     }
// }

// export async function latestCorretto(major: number): Promise<RemoteJdkDistribution | null> {

//     let sanitizedOS: string, ext: string
//     const arch = Architecture.X64

//     switch(process.platform) {
//         case Platform.WIN32:
//             sanitizedOS = 'windows'
//             ext = 'zip'
//             break
//         case Platform.DARWIN:
//             // TODO Corretto does not yet support arm64
//             sanitizedOS = 'macos'
//             ext = 'tar.gz'
//             break
//         case Platform.LINUX:
//             sanitizedOS = 'linux'
//             ext = 'tar.gz'
//             break
//         default:
//             sanitizedOS = process.platform
//             ext = 'tar.gz'
//             break
//     }

//     const url = `https://corretto.aws/downloads/latest/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`
//     try {
//         const res = await got.head(url)
//         if(res.statusCode === 200) {
//             return {
//                 uri: url,
//                 size: parseInt(res.headers['content-length']!),
//                 name: url.substr(url.lastIndexOf('/')+1)
//             }
//         } else {
//             logger.error(`Error while retrieving latest Corretto JDK ${major} (${sanitizedOS} ${arch}): ${res.statusCode} ${res.statusMessage ?? ''}`)
//             return null
//         }
//     } catch(err) {
//         logger.error(`Error while retrieving latest Corretto JDK ${major} (${sanitizedOS} ${arch}).`, err)
//         return null
//     }
// }

// /**
//  * Returns the path of the OS-specific executable for the given Java
//  * installation. Supported OS's are win32, darwin, linux.
//  * 
//  * @param {string} rootDir The root directory of the Java installation.
//  * @returns {string} The path to the Java executable.
//  */
// export function javaExecFromRoot(rootDir: string): string {
//     switch(process.platform) {
//         case Platform.WIN32:
//             return join(rootDir, 'bin', 'javaw.exe')
//         case Platform.DARWIN:
//             return join(rootDir, 'Contents', 'Home', 'bin', 'java')
//         case Platform.LINUX:
//             return join(rootDir, 'bin', 'java')
//         default:
//             return rootDir
//     }
// }

// /**
//  * Check to see if the given path points to a Java executable.
//  * 
//  * @param {string} pth The path to check against.
//  * @returns {boolean} True if the path points to a Java executable, otherwise false.
//  */
// export function isJavaExecPath(pth: string): boolean {
//     switch(process.platform) {
//         case Platform.WIN32:
//             return pth.endsWith(join('bin', 'javaw.exe'))
//         case Platform.DARWIN:
//             return pth.endsWith(join('bin', 'java'))
//         case Platform.LINUX:
//             return pth.endsWith(join('bin', 'java'))
//         default:
//             return false
//     }
// }

// // TODO Move this
// /**
//  * Load Mojang's launcher.json file.
//  * 
//  * @returns {Promise.<Object>} Promise which resolves to Mojang's launcher.json object.
//  */
// export async function loadMojangLauncherData(): Promise<LauncherJson | null> {

//     try {
//         const res = await got.get<LauncherJson>('https://launchermeta.mojang.com/mc/launcher.json', { responseType: 'json' })
//         return res.body
//     } catch(err) {
//         logger.error('Failed to retrieve Mojang\'s launcher.json file.')
//         return null
//     }
// }

// /**
//  * Parses a full Java Runtime version string and resolves
//  * the version information. Dynamically detects the formatting
//  * to use.
//  * 
//  * @param {string} verString Full version string to parse.
//  * @returns Object containing the version information.
//  */
// export function parseJavaRuntimeVersion(verString: string): JavaVersion{
//     if(verString.startsWith('1.')){
//         return parseJavaRuntimeVersion_8(verString)
//     } else {
//         return parseJavaRuntimeVersion_9(verString)
//     }
// }

// /**
//  * Parses a full Java Runtime version string and resolves
//  * the version information. Uses Java 8 formatting.
//  * 
//  * @param {string} verString Full version string to parse.
//  * @returns Object containing the version information.
//  */
// export function  parseJavaRuntimeVersion_8(verString: string): JavaVersion {
//     // 1.{major}.0_{update}-b{build}
//     // ex. 1.8.0_152-b16
//     const regex = /^1.(.+).(.+)_(.+)-b(.+)$/
//     const match = regex.exec(verString)!

//     return {
//         major: parseInt(match[1]),
//         minor: parseInt(match[2]),
//         revision: parseInt(match[3]),
//         build: parseInt(match[4])
//     }
// }

// /**
//  * Parses a full Java Runtime version string and resolves
//  * the version information. Uses Java 9+ formatting.
//  * 
//  * @param {string} verString Full version string to parse.
//  * @returns Object containing the version information.
//  */
// export function  parseJavaRuntimeVersion_9(verString: string): JavaVersion {
//     // {major}.{minor}.{revision}+{build}
//     // ex. 10.0.2+13
//     const regex = /^(.+)\.(.+).(.+)\+(.+)$/
//     const match = regex.exec(verString)!

//     return {
//         major: parseInt(match[1]),
//         minor: parseInt(match[2]),
//         revision: parseInt(match[3]),
//         build: parseInt(match[4])
//     }
// }