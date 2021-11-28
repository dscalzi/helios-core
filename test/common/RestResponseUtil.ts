import { expect } from 'chai'
import { RestResponse, RestResponseStatus } from '../../lib/common/rest/RestResponse'

export function assertResponse(res: RestResponse<unknown>): void {
    expect(res).to.not.be.an('error')
    expect(res).to.be.an('object')
}

export function expectSuccess(res: RestResponse<unknown>): void {
    assertResponse(res)
    expect(res).to.have.property('responseStatus')
    expect(res.responseStatus).to.equal(RestResponseStatus.SUCCESS)
}

export function expectFailure(res: RestResponse<unknown>): void {
    expect(res.responseStatus).to.not.equal(RestResponseStatus.SUCCESS)
}