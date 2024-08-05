import { expect } from 'chai'
import { mcVersionAtLeast } from '../../../lib/common/util/MojangUtils'

describe('MojangUtil', () => {

    it('mcVersionAtLeast', async () => {

        expect(mcVersionAtLeast('1.21', '1.21')).to.be.true
        expect(mcVersionAtLeast('1.20.5', '1.20.3')).to.be.false
        expect(mcVersionAtLeast('1.20.5', '1.20.5')).to.be.true
        expect(mcVersionAtLeast('1.20.5', '1.20.6')).to.be.true
        expect(mcVersionAtLeast('1.20.5', '1.20')).to.be.false
        expect(mcVersionAtLeast('1.20.5', '1.21')).to.be.true
        expect(mcVersionAtLeast('1.20', '1.20.5')).to.be.true

        expect(mcVersionAtLeast('1.12', '1.20.5')).to.be.true
        expect(mcVersionAtLeast('1.12', '1.12.1')).to.be.true
        expect(mcVersionAtLeast('1.12', '1.11.2')).to.be.false
        expect(mcVersionAtLeast('1.12', '1.7')).to.be.false

    })

})