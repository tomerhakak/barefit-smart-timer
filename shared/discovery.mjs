// Discovery only changes the transport address; it never changes workout state.
export async function probeHub(base, fetcher = fetch) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 3000);
  try {
    const url = new URL(base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const response = await fetcher(url.origin + '/api/health', {signal: abort.signal});
    if (!response.ok) return null;
    const data = await response.json();
    if (data.ok !== true || data.service !== 'barefit' || !/^[a-f0-9]{32}$/.test(data.hubId)) return null;
    return {base: url.origin, id: data.hubId};
  } catch { return null; }
  finally { clearTimeout(timer); }
}

export async function locateHub({base, knownId, discover, probe = probeHub}) {
  const current = base ? await probe(base) : null;
  if (current && (!knownId || current.id === knownId)) return {state:'connected', ...current};
  // No subnet scanning: only endpoints advertised by BareFit's LAN service.
  const advertised = await discover();
  const urls = [...new Set(advertised.map(service => service.url))].slice(0, 16);
  const found = (await Promise.all(urls.map(url => probe(url)))).filter(Boolean);
  const matches = found.filter(hub => !knownId || hub.id === knownId);
  const ids = new Set(matches.map(hub => hub.id));
  if (!matches.length) return {state:'offline'};
  if (ids.size !== 1) return {state:'ambiguous'};
  return {state:'connected', ...matches[0]};
}
