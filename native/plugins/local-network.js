const { withAndroidManifest } = require("expo/config-plugins");
// Studio LAN transport. Deploy with trusted TLS when operating on untrusted Wi-Fi.
module.exports = (config) =>
  withAndroidManifest(config, (c) => {
    c.modResults.manifest.application[0].$["android:usesCleartextTraffic"] =
      "true";
    const features=c.modResults.manifest['uses-feature'] || [];
    for(const name of ['android.hardware.camera','android.hardware.camera.autofocus']) {
      if(!features.some(f=>f.$['android:name']===name)) features.push({$:{'android:name':name,'android:required':'false'}});
    }
    c.modResults.manifest['uses-feature']=features;
    return c;
  });
