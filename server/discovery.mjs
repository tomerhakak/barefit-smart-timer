import {Bonjour} from 'bonjour-service';
import {networkInterfaces} from 'node:os';

export function lanAddresses() {
  return Object.entries(networkInterfaces())
    .filter(([name]) => !/virtual|vethernet|wsl|docker|loopback|vmware|virtualbox|vpn|tailscale/i.test(name))
    .flatMap(([, entries]) => entries || [])
    .filter(a => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.'))
    .map(a => a.address).sort();
}

export function advertiseHub(port, hubId) {
  let bonjour, fingerprint, stopped = false;
  const warn = () => { fingerprint = undefined; console.warn('BareFit LAN discovery unavailable; manual connection remains available.'); };
  const dispose = () => {
    const previous = bonjour;
    bonjour = null;
    if (!previous) return;
    let done = false;
    const close = () => { if (!done) { done = true; clearTimeout(deadline); previous.destroy(); } };
    const deadline = setTimeout(close, 1000);
    deadline.unref();
    try { previous.unpublishAll(close); } catch { close(); }
  };
  const refresh = () => {
    const addresses = lanAddresses();
    const next = addresses.join(',');
    if (stopped || next === fingerprint) return;
    fingerprint = next;
    dispose();
    if (!next) return;
    try {
      bonjour = new Bonjour(undefined, warn);
      const service = bonjour.publish({name:`BareFit-${hubId.slice(0, 8)}`, host:`barefit-${hubId}.local`, type:'barefit', port,
        txt:{id:hubId, version:'1'}, disableIPv6:true});
      // bonjour-service 1.4.4 otherwise announces virtual/VPN adapter addresses too.
      // Install the filter before its asynchronous probing completes.
      const records = service.records.bind(service);
      service.records = () => records().filter(record => record.type !== 'AAAA' && (record.type !== 'A' || addresses.includes(record.data)));
      service.on('error', warn);
    } catch { warn(); }
  };
  refresh();
  const timer = setInterval(refresh, 15000);
  timer.unref();
  return () => {
    stopped = true;
    clearInterval(timer);
    dispose();
  };
}
