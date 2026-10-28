const {withMainApplication, withDangerousMod, withAndroidManifest} = require('expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');
const registration = 'add(com.barefit.discovery.BareFitDiscoveryPackage())';
const localRegistration = 'add(com.barefit.localhub.BareFitLocalHubPackage())';
function register(source) {
  if (source.includes(registration) && source.includes(localRegistration)) return source;
  const marker = 'PackageList(this).packages.apply {';
  if (!source.includes(marker)) throw Error('Cannot register BareFit LAN discovery');
  const additions = [!source.includes(registration) ? registration : '', !source.includes(localRegistration) ? localRegistration : ''].filter(Boolean).join('\n              ');
  return source.replace(marker, marker + '\n              ' + additions);
}
async function copySources(projectRoot, androidRoot) {
  const target = path.join(androidRoot, 'app/src/main/java/com/barefit/discovery');
  await fs.mkdir(target, {recursive:true});
  for (const file of ['BareFitDiscoveryModule.java', 'BareFitDiscoveryPackage.java'])
    await fs.copyFile(path.join(projectRoot, 'modules', file), path.join(target, file));
  const localTarget = path.join(androidRoot, 'app/src/main/java/com/barefit/localhub');
  await fs.mkdir(localTarget, {recursive:true});
  for (const file of ['BareFitLocalHubModule.java', 'BareFitLocalHubPackage.java'])
    await fs.copyFile(path.join(projectRoot, 'modules', file), path.join(localTarget, file));
  // The TV hub also serves the browser coach UI so scanning the QR from the
  // phone's normal camera opens a usable app without a computer.
  const webDist = path.resolve(projectRoot, '..', 'dist');
  const webAssets = path.join(androidRoot, 'app/src/main/assets/barefit-web');
  try {
    await fs.access(path.join(webDist, 'index.html'));
    await fs.rm(webAssets, {recursive:true, force:true});
    await fs.cp(webDist, webAssets, {recursive:true});
  } catch {
    // Native-only builds can still compile; the TV hub will show an explicit
    // missing-UI response until the web bundle is generated.
  }
}
module.exports = config => {
  config = withAndroidManifest(config, c => {
    const permissions = c.modResults.manifest['uses-permission'] ||= [];
    for (const name of ['android.permission.CHANGE_WIFI_MULTICAST_STATE', 'android.permission.ACCESS_WIFI_STATE'])
      if (!permissions.some(p => p.$['android:name'] === name)) permissions.push({$:{'android:name':name}});
    return c;
  });
  config = withMainApplication(config, c => {
    c.modResults.contents = register(c.modResults.contents); return c;
  });
  return withDangerousMod(config, ['android', async c => {
    await copySources(c.modRequest.projectRoot, c.modRequest.platformProjectRoot); return c;
  }]);
};
module.exports.register = register;
module.exports.copySources = copySources;
