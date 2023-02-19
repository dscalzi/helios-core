import { Server } from 'helios-distribution-types'

export function getMainServer(servers: Server[]): Server {

    const mainServer = servers.find(({ mainServer }) => mainServer)
    if(mainServer == null && servers.length > 0) {
        return servers[0]
    }

    return mainServer!
}