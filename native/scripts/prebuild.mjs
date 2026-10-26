import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
const tv = process.argv[2] === "tv";
const clean = process.argv.includes("--clean");
const root = realpathSync(process.cwd());
for (const name of ["android", "ios"]) {
  const target = path.join(root, name);
  if (existsSync(target) && !realpathSync(target).startsWith(root + path.sep)) {
    throw Error("Generated project resolves outside the app directory");
  }
}
const manifest = path.join(root, "android/app/src/main/AndroidManifest.xml");
if (existsSync(manifest) && readFileSync(manifest, "utf8").includes("LEANBACK_LAUNCHER") !== tv && !clean) {
  console.error("Changing target requires regeneration. Back up manual Native edits, then rerun with -- --clean.");
  process.exit(1);
}
const r = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["expo", "prebuild", "--no-install", ...(clean ? ["--clean"] : [])],
  {
    stdio: "inherit",
    env: { ...process.env, EXPO_TV: tv ? "1" : "0" },
    shell: process.platform === "win32",
  },
);
process.exit(r.status ?? 1);
