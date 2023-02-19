import { Asset } from './Asset'
import { downloadQueue, getExpectedDownloadSize } from './DownloadEngine'
import { IndexProcessor } from './IndexProcessor'

// Tentative
// Ex Construct and pass MojangIndexProcessor + HeliosIndexProcessor
export async function fullRepair(processors: IndexProcessor[]): Promise<void> {

    // Init all
    for(const processor of processors) {
        await processor.init()
    }

    const assets: Asset[] = []
    // Validate
    for(const processor of processors) {
        Object.values((await processor.validate()))
            .flatMap(asset => asset)
            .forEach(asset => assets.push(asset))
    }

    const expectedTotalSize = getExpectedDownloadSize(assets)

    const receivedEach = await downloadQueue(assets, received => {
        // TODO implement
    })

}