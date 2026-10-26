const isTV = process.env.EXPO_TV === "1";
module.exports = {
  expo: {
    name: "BareFit",
    slug: "barefit",
    version: "0.3.0",
    orientation: isTV ? "landscape" : "default",
    userInterfaceStyle: "dark",
    icon: "../public/icon.png",
    assetBundlePatterns: ["**/*"],
    ios: {
      bundleIdentifier: isTV ? "com.barefit.timer.tv" : "com.barefit.timer",
      supportsTablet: true,
      infoPlist: {
        NSLocalNetworkUsageDescription:
          "BareFit מתחבר למסך ולמאמן ברשת המקומית של הסטודיו.",
        NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
      },
    },
    android: {
      versionCode: 3,
      package: isTV ? "com.barefit.timer.tv" : "com.barefit.timer",
      permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "WAKE_LOCK"],
      blockedPermissions: ["android.permission.RECORD_AUDIO", ...(isTV ? ["android.permission.CAMERA"] : [])],
    },
    plugins: [
      ...(!isTV ? [["expo-camera", {cameraPermission:"BareFit משתמש במצלמה לסריקת קוד החיבור ממסך האימון.",microphonePermission:false,recordAudioAndroid:false}]] : []),
      ["@react-native-tvos/config-tv", { isTV, androidTVBanner: "../public/tv-banner.png" }],
      [
        "expo-font",
        {
          fonts: [
            "../public/assets/Anton-Regular.ttf",
            "../public/assets/Heebo.ttf",
          ],
        },
      ],
      "./plugins/local-network.js",
      "./plugins/lan-discovery.js",
      "./plugins/phone-camera.js",
      "./plugins/shared-bundle-inputs.js",
    ],
  },
};
