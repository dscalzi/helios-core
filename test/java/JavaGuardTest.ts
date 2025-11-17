import { filterApplicableJavaPaths, HotSpotSettings, JavaVersion, JvmDetails, parseJavaRuntimeVersion, rankApplicableJvms, Win32RegistryJavaDiscoverer } from '../../lib/java/JavaGuard'
import { expect } from 'chai'
import { Platform } from 'helios-distribution-types'
import { mkdtemp, rm, mkdir, writeFile } from 'fs-extra'
import { tmpdir } from 'os'
import { join } from 'path'
import { getHotSpotSettings } from '../../lib/java/JavaGuard'

describe('JavaGuard', () => {

    // Only defining the properties that the function actually uses.
    const discovered: { [path: string]: HotSpotSettings } = {
        'path/to/jdk-64/21': {
            'sun.arch.data.model': '64',
            'os.arch': 'amd64',
            'java.version': '21.0.0',
            'java.runtime.version': '21.0.0+1',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-64/17': {
            'sun.arch.data.model': '64',
            'os.arch': 'amd64',
            'java.version': '17.0.5',
            'java.runtime.version': '17.0.5+8',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-32/17': {
            'sun.arch.data.model': '32',
            'os.arch': 'x86',
            'java.version': '17.0.5',
            'java.runtime.version': '17.0.5+8',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-64/8': {
            'sun.arch.data.model': '64',
            'os.arch': 'amd64',
            'java.version': '1.8.0_362',
            'java.runtime.version': '1.8.0_362-b09',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-32/8': {
            'sun.arch.data.model': '32',
            'os.arch': 'x86',
            'java.version': '1.8.0_362',
            'java.runtime.version': '1.8.0_362-b09',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings
    }

    it('Jvm Filtering', async () => {

        const rangeWithAssertions: { [range: string]: (details: JvmDetails[]) => void } = {
            '>=17.x': details => {
                expect(details.map(({ path }) => path))
                    .to.have.members([
                        'path/to/jdk-64/21',
                        'path/to/jdk-64/17'
                    ])
            },
            '8.x': details => {
                expect(details.map(({ path }) => path))
                    .to.have.members([
                        'path/to/jdk-64/8'
                    ])
            }
        }

        for(const [ range, assertion ] of Object.entries(rangeWithAssertions)) {
            const details = filterApplicableJavaPaths(discovered, range)
            assertion(details)
        }
    })

    it('Jvm Selection', async () => {

        const rangeWithAssertions: { [range: string]: (details: JvmDetails | null) => void } = {
            '>=17.x': details => {
                expect(details).to.not.be.null
                expect(details!.path).to.equal('path/to/jdk-64/21')
            },
            '^17.x': details => {
                expect(details).to.not.be.null
                expect(details!.path).to.equal('path/to/jdk-64/17')
            },
            '9.x': details => {
                expect(details).to.be.null
            },
            '8.x': details => {
                expect(details).to.not.be.null
                expect(details!.path).to.equal('path/to/jdk-64/8')
            }
        }

        for(const [ range, assertion ] of Object.entries(rangeWithAssertions)) {
            const details = filterApplicableJavaPaths(discovered, range)
            rankApplicableJvms(details)
            assertion(details.length > 0 ? details[0] : null)
        }
    })

    it('Java Version Parsing', async () => {

        const testMatrix: [string, JavaVersion | null][] = [
            ['1.8.0_351', { major: 8, minor: 0, patch: 351 }],
            ['1.8.0_351-b10', { major: 8, minor: 0, patch: 351 }],
            ['17.0.5', { major: 17, minor: 0, patch: 5 }],
            ['17.0.5.8', { major: 17, minor: 0, patch: 5 }],
            ['17.0.6+9-LTS-190', { major: 17, minor: 0, patch: 6 }],
            ['abc', null],
            ['1.8', null],
            ['17.0', null]
        ]

        for(const [test, res] of testMatrix) {
            expect(parseJavaRuntimeVersion(test)).to.deep.equal(res)
        }
    })

    it.skip('Win32 Registry Keys', async () => {

        const res = await (new Win32RegistryJavaDiscoverer()).discover()

        for(const file of res) {
            console.log(file)
        }

    })

})

if (process.platform === Platform.WIN32) {
    describe('JavaGuard Windows Specific Tests', () => {

        let tempDir: string
        let binDir: string
        let javawExePath: string
        let javaExePath: string

        beforeEach(async function() {
            this.timeout(10000) // Increase timeout for setup
            tempDir = await mkdtemp(join(tmpdir(), 'Тестовый юзер '))
            binDir = join(tempDir, 'bin')
            await mkdir(binDir, { recursive: true })

            javawExePath = join(binDir, 'javaw.exe')
            javaExePath = join(binDir, 'java.exe')

            const mockJavaExeContent = `@echo off
if exist "java.dll" (
    >&2 echo Property Settings:
    >&2 echo     java.version = 1.8.0_362
    >&2 echo     java.vendor = MockJDK
    >&2 echo     sun.arch.data.model = 64
    >&2 echo     os.arch = amd64
    >&2 echo     java.runtime.version = 1.8.0_362-b09
) else (
    >&2 echo Error: could not find java.dll
    >&2 echo Error: Could not find Java SE Runtime Environment.
    exit 1
)`
            await writeFile(`${javaExePath}.bat`, mockJavaExeContent)
            await writeFile(`${javawExePath}.bat`, mockJavaExeContent)

            await writeFile(join(binDir, 'java.dll'), '')
        })

        afterEach(async function() {
            this.timeout(10000) // Increase timeout for cleanup
            await rm(tempDir, { recursive: true, force: true })
        })

        it('should resolve JVM settings from a path with non-ascii characters', async () => {
            const settings = await getHotSpotSettings(javawExePath)
            
            // After the fix, this should pass.
            // The test is designed to fail before the fix, because 'cwd' with unicode is buggy.
            expect(settings).to.not.be.null
            expect(settings!['java.vendor']).to.equal('MockJDK')

        }).timeout(10000)
    })
}
