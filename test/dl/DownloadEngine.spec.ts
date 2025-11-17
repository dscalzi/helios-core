import 'mocha'
import { expect } from 'chai'
import { downloadFile } from '../../lib/dl/DownloadEngine'
import { Asset, HashAlgo } from '../../lib/dl'

describe('DownloadEngine', () => {

    it('should throw an error if the asset is null', async () => {
        try {
            await downloadFile(null!)
            expect.fail('Expected an error to be thrown.')
        } catch (err: any) {
            expect(err.message).to.equal('Asset or asset path is null or undefined.')
        }
    })

    it('should throw an error if the asset path is null', async () => {
        const asset: Asset = {
            id: 'test',
            url: 'http://test.com/test.zip',
            size: 123,
            hash: '123',
            algo: HashAlgo.SHA256,
            path: null!
        }
        try {
            await downloadFile(asset)
            expect.fail('Expected an error to be thrown.')
        } catch (err: any) {
            expect(err.message).to.equal('Asset or asset path is null or undefined.')
        }
    })

})
