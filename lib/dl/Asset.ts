export interface Asset {
    id: string
    hash: string
    algo: string
    size: number
    url: string
    path: string
}

export enum HashAlgo {
    SHA1 = 'sha1',
    SHA256 = 'sha256',
    MD5 = 'md5'
}