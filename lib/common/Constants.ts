export abstract class Constants {

    public static readonly MOJANG = {
        AUTH_ENDPOINT: 'https://authserver.mojang.com',
        SESSION_SERVER: 'https://sessionserver.mojang.com/',
        SKINS_SERVER: 'https://textures.minecraft.net/',
        API_SERVER: 'https://api.mojang.com/',
        ACCOUNT_SERVER: 'https://account.mojang.com/',
        LAUNCHER_JSON_ENDPOINT: 'https://launchermeta.mojang.com/mc/launcher.json',
        VERSION_MANIFEST_ENDPOINT: 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json',
        ASSET_RESOURCE_ENDPOINT: 'https://resources.download.minecraft.net'
    }

    public static readonly MICROSOFT = {
        LOGIN_BASE: 'https://login.microsoftonline.com/',
        TOKEN_ENDPOINT: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
        XBOX_AUTH_BASE: 'https://user.auth.xboxlive.com/',
        XBOX_AUTH_ENDPOINT: 'https://user.auth.xboxlive.com/user/authenticate',
        XSTS_AUTH_BASE: 'https://xsts.auth.xboxlive.com/',
        XSTS_AUTH_ENDPOINT: 'https://xsts.auth.xboxlive.com/xsts/authorize',
        MINECRAFT_API_ENDPOINT: 'https://api.minecraftservices.com/minecraft/profile',
        MINECRAFT_AUTH_ENDPOINT: 'https://api.minecraftservices.com/authentication/login_with_xbox',
        MINECRAFT_ENTITLEMENT_ENDPOINT: 'https://api.minecraftservices.com/entitlements/mcstore',
        NATIVE_CLIENT_REDIRECT_URI: 'https://login.microsoftonline.com/common/oauth2/nativeclient',
        XBL_RELYING_PARTY: 'http://auth.xboxlive.com',
        XSTS_RELYING_PARTY: 'rp://api.minecraftservices.com/'
    }

    public static readonly JAVA = {
        ADOPTIUM_API_ENDPOINT: 'https://api.adoptium.net/v3/assets/latest',
        CORRETTO_DOWNLOAD_ENDPOINT: 'https://corretto.aws/downloads'
    }

}
