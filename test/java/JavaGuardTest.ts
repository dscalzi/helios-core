import { Win32RegistryJavaDiscoverer } from '../../lib/java/JavaGuard'

describe('JavaGuard', () => {

    it.skip('Win32 Registry Keys', async () => {

        const res = await (new Win32RegistryJavaDiscoverer()).discover()

        for(const file of res) {
            console.log(file)
        }

    })

})