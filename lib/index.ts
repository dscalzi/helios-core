import * as RestResponse from './common/rest/RestResponse'
import * as MicrosoftResponse from './microsoft/rest/MicrosoftResponse'
import * as MicrosoftAuth from './microsoft/rest/MicrosoftAuth'
import * as Protocol from './mojang/net/Protocol'
import * as ServerStatusAPI from './mojang/net/ServerStatusAPI'
import * as MojangResponse from './mojang/rest/MojangResponse'
import * as MojangRestAPI from './mojang/rest/MojangRestAPI'

export default {
    Common: {
        RestResponse
    },
    Microsoft: {
        MicrosoftAuth,
        MicrosoftResponse
    },
    Mojang: {
        Protocol,
        ServerStatusAPI,
        MojangResponse,
        MojangRestAPI
    }
}
