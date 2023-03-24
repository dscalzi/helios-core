import { filterApplicableJavaPaths, HotSpotSettings, JvmDetails, rankApplicableJvms, Win32RegistryJavaDiscoverer } from '../../lib/java/JavaGuard'
import { expect } from 'chai'

describe('JavaGuard', () => {

    // Only defining the properties that the function actually uses.
    const discovered: { [path: string]: HotSpotSettings } = {
        'path/to/jdk-64/21': {
            'sun.arch.data.model': '64',
            'os.arch': 'amd64',
            'java.runtime.version': '21.0.0+1',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-64/17': {
            'sun.arch.data.model': '64',
            'os.arch': 'amd64',
            'java.runtime.version': '17.0.5+8',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-32/17': {
            'sun.arch.data.model': '32',
            'os.arch': 'x86',
            'java.runtime.version': '17.0.5+8',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-64/8': {
            'sun.arch.data.model': '64',
            'os.arch': 'amd64',
            'java.runtime.version': '1.8.0_362-b09',
            'java.vendor': 'Eclipse Adoptium'
        } as HotSpotSettings,
        'path/to/jdk-32/8': {
            'sun.arch.data.model': '32',
            'os.arch': 'x86',
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

    it.skip('Win32 Registry Keys', async () => {

        const res = await (new Win32RegistryJavaDiscoverer()).discover()

        for(const file of res) {
            console.log(file)
        }

    })

})