import {Bonjour} from 'bonjour-service';
import {createHub} from '../server/hub.mjs';
import {advertiseHub, lanAddresses} from '../server/discovery.mjs';
import {probeHub} from '../shared/discovery.mjs';

const hub = await createHub({persist:false});
await new Promise(resolve => hub.server.listen(0, '0.0.0.0', resolve));
const port = hub.server.address().port;
const bonjour = new Bonjour(undefined, error => console.error('mDNS:', error.message));
let browser, stop, timeout;
try {
  const found = new Promise((resolve, reject) => {
    timeout = setTimeout(() => reject(Error('No matching mDNS announcement received within 15 seconds')), 15000);
    browser = bonjour.find({type:'barefit'}, service => {
      if (service.txt?.id === hub.hubId) resolve(service);
    });
  });
  stop = advertiseHub(port, hub.hubId);
  const service = await found;
  if (service.addresses.some(address => !lanAddresses().includes(address))) throw Error('Discovery advertised a non-LAN adapter');
  const urls = service.addresses.filter(ip => /^\d+\.\d+\.\d+\.\d+$/.test(ip)).map(ip => `http://${ip}:${service.port}`);
  const probes = await Promise.all(urls.map(url => probeHub(url)));
  const reachable = probes.find(result => result?.id === hub.hubId);
  if (!reachable) throw Error('Announcement found, but HTTP identity check failed');
  console.log(JSON.stringify({mdns:'passed',httpIdentity:'passed',serviceType:service.type,reachable:reachable.base}));
} finally {
  clearTimeout(timeout);
  browser?.stop();
  bonjour.destroy();
  stop?.();
  await hub.close();
}
