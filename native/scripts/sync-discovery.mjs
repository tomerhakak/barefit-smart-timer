// Apply the same Expo plugin sources to existing generated phone/TV build caches.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const plugin = require('../plugins/lan-discovery.js');
const root = await fs.realpath(new URL('..', import.meta.url));
for (const name of ['android', 'android-phone-build', 'android-tv-build']) {
  try { await fs.access(path.join(root, name)); } catch { continue; }
  const android = await fs.realpath(path.join(root, name));
  if (path.dirname(android) !== root) throw Error('Generated project outside native workspace');
  const appDir = path.join(android, 'app/src/main');
  const phoneApp = path.join(appDir, 'java/com/barefit/timer/MainApplication.kt');
  const tvApp = path.join(appDir, 'java/com/barefit/timer/tv/MainApplication.kt');
  let main = phoneApp;
  try {await fs.access(main);} catch {main = tvApp;}
  const source = await fs.readFile(main, 'utf8');
  await fs.writeFile(main, plugin.register(source));
  await plugin.copySources(root, android);
  const manifestPath = path.join(appDir, 'AndroidManifest.xml');
  let manifest = await fs.readFile(manifestPath, 'utf8');
  for (const permission of ['CHANGE_WIFI_MULTICAST_STATE', 'ACCESS_WIFI_STATE']) {
    if (!manifest.includes(`android.permission.${permission}`))
      manifest = manifest.replace(/(<manifest\b[^>]*>)/, `$1\n  <uses-permission android:name="android.permission.${permission}"/>`);
  }
  await fs.writeFile(manifestPath, manifest);
  console.log(`LAN discovery registered: ${name}`);
}
