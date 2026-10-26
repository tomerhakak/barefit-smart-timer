import { createHub } from "./hub.mjs";
import { networkInterfaces } from "node:os";
import {advertiseHub, lanAddresses} from './discovery.mjs';
const port = Number(process.env.PORT || 4174);
const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((a) => a.family === "IPv4" && !a.internal)
  .map((a) => a.address);
const hub = await createHub({
  studioUrls: () => process.env.STUDIO_URL ? [new URL(process.env.STUDIO_URL).origin] : lanAddresses().map(a=>`http://${a}:${port}`),
  allowOrigins: [
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    `http://localhost:${port}`,
    `http://127.0.0.1:${port}`,
    ...addresses.flatMap((a) => [`http://${a}:4173`, `http://${a}:${port}`]),
    ...(process.env.ALLOW_ORIGINS || "").split(",").filter(Boolean),
  ],
});
let stopDiscovery = () => {};
hub.server.listen(port, "0.0.0.0", () => {
  stopDiscovery = advertiseHub(port, hub.hubId);
  console.log(`BareFit: http://localhost:${port}`);
  addresses.forEach((a) => console.log(`Studio network: http://${a}:${port}`));
});
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  stopDiscovery();
  await hub.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
