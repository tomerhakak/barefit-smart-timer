import { readdir, readFile, writeFile, mkdir, cp } from "node:fs/promises";
import path from "node:path";
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else files.push("./" + p.replaceAll("\\", "/").replace(/^dist\//, ""));
  }
}
await walk("dist");
// Version corrected speech independently from an older tab's service-worker cache.
files.push(...files.filter(file => file.includes('/coach/') && file.endsWith('.wav')).map(file => file + '?v=2'));
const version = Date.now().toString(36);
await writeFile(
  "dist/sw.js",
  `const CACHE='barefit-${version}';const ASSETS=${JSON.stringify(files)};self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('barefit-')&&k!==CACHE).map(k=>caches.delete(k))))));self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin||new URL(e.request.url).pathname.includes('/api/'))return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});`,
);
for (const platform of ["tizen", "webos"]) {
  const dir = `packages/${platform}`;
  await mkdir(dir, { recursive: true });
  await cp("dist", dir, { recursive: true });
  await cp(`platforms/${platform}`, dir, { recursive: true });
}
console.log(
  "Web build and Tizen/webOS app directories ready. Signing and device installation remain platform-specific.",
);
// Offer the separately built phone APK without bundling it into TV apps/offline caches.
for (const filename of ['BareFit-Android-0.3.0-test.apk','BareFit-AndroidTV-0.3.0-test.apk']) try {
  await mkdir('dist/downloads', {recursive:true});
  await cp(`packages/${filename}`,`dist/downloads/${filename}`);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
