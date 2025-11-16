import { ensureEncodedPath, ensureDecodedPath } from '../../lib/util/NodeUtil'
import { expect } from 'chai'
import * as path from 'path'

describe('NodeUtil', () => {

    // With the backward compatibility fix, `ensureEncodedPath` should now
    // ONLY normalize paths with forward slashes. `ensureDecodedPath` should
    // convert them back to native separators.
    
    it('should correctly process a POSIX path', () => {
        const testPath = '/Users/test/Русский/file name.txt'
        const encoded = ensureEncodedPath(testPath)
        // On POSIX, nothing should change.
        expect(encoded).to.equal(testPath)
        const decoded = ensureDecodedPath(encoded)
        expect(decoded).to.equal(testPath)
    })

    it('should correctly process a Windows path', () => {
        const testPath = 'C:\\Users\\test\\Русский\\file name.txt'
        const expectedEncoded = 'C:/Users/test/Русский/file name.txt'
        const encoded = ensureEncodedPath(testPath)
        // Backslashes should be converted to forward slashes.
        expect(encoded).to.equal(expectedEncoded)
        const decoded = ensureDecodedPath(encoded)
        // Decoded path should have native separators.
        expect(decoded).to.equal(path.normalize(testPath))
    })

    it('should correctly process a relative path', () => {
        const testPath = 'data/common/1.12.2'
        const encoded = ensureEncodedPath(testPath)
        expect(encoded).to.equal(testPath)
        const decoded = ensureDecodedPath(encoded)
        expect(decoded).to.equal(path.normalize(testPath))
    })

    it('should correctly decode a file URI', () => {
        const uri = 'file:///C:/Users/test/file.txt'
        const expectedPath = 'C:\\Users\\test\\file.txt'
        const decoded = ensureDecodedPath(uri)
        expect(decoded).to.equal(path.normalize(expectedPath))
    })

})
