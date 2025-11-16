import { ensureEncodedPath, ensureDecodedPath } from '../../lib/util/NodeUtil'
import { expect } from 'chai'
import { platform } from 'os'

describe('NodeUtil', () => {
    it('should encode and decode paths with special characters', () => {
        const path = '/Users/testuser/123/Русский/test file.txt'
        const encoded = ensureEncodedPath(path)
        const decoded = ensureDecodedPath(encoded)
        expect(decoded).to.equal(path)
    })

    it('should handle windows paths', () => {
        if (platform() === 'win32') {
            const path = 'C:\\Users\\testuser\\123\\Русский\\test file.txt'
            const encoded = ensureEncodedPath(path)
            const decoded = ensureDecodedPath(encoded)
            expect(decoded).to.equal(path)
        }
    })
})
