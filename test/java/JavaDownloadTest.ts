import 'mocha'
import { latestCorretto } from '../../lib/java/JavaGuard'
import { expect } from 'chai'
import nock from 'nock'
import { tmpdir } from 'os'
import { join } from 'path'
import { URL } from 'url'

describe('JavaGuard Download', () => {

    afterEach(() => {
        // Ensure nock is clean after each test.
        nock.cleanAll()
    })

    it('should resolve the correct filename after a redirect with a generic name', async () => {
        const dataDir = join(tmpdir(), 'helios-core-test')
        const major = 8

        // Use a generic, non-specific filename for the test.
        const genericFileName = 'a-dummy-filename-123.zip'
        const redirectedUrl = `https://some.cdn.com/path/to/${genericFileName}`
        const md5checksum = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'

        // Construct the initial URL that will be redirected.
        const arch = process.arch === 'arm64' ? 'aarch64' : 'x64'
        const sanitizedOS = process.platform === 'win32' ? 'windows' : (process.platform === 'darwin' ? 'macos' : process.platform)
        const ext = process.platform === 'win32' ? 'zip' : 'tar.gz'
        
        const baseUrl = 'https://corretto.aws'
        const initialPath = `/downloads/latest/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`
        const md5Path = `/downloads/latest_checksum/amazon-corretto-${major}-${arch}-${sanitizedOS}-jdk.${ext}`

        // 1. Mock the initial HEAD request, which will return a 302 redirect.
        nock(baseUrl)
            .head(initialPath)
            .reply(302, undefined, {
                'Location': redirectedUrl
            })
        
        // 2. Mock the subsequent HEAD request to the redirected URL.
        // `got` will follow the redirect, so we must mock the destination.
        const parsedRedirectUrl = new URL(redirectedUrl)
        nock(`${parsedRedirectUrl.protocol}//${parsedRedirectUrl.host}`)
            .head(parsedRedirectUrl.pathname)
            .reply(200, undefined, {
                'Content-Length': '12345' // Dummy content length.
            })

        // 3. Mock the checksum GET request.
        nock(baseUrl)
            .get(md5Path)
            .reply(200, md5checksum)

        // Call the function under test.
        const asset = await latestCorretto(major, dataDir)

        // Assertions
        expect(asset, 'Asset should not be null').to.not.be.null
        expect(asset!.id, 'Asset ID should match the generic filename').to.equal(genericFileName)
        expect(asset!.path, 'Asset path should be correctly constructed').to.equal(join(dataDir, 'runtime', process.arch, genericFileName))
        expect(asset!.url, 'Asset URL should be the final, redirected URL').to.equal(redirectedUrl)
        expect(asset!.hash, 'Asset hash should match the mocked checksum').to.equal(md5checksum)
    })

})
