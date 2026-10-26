import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHub} from '../server/hub.mjs';
import {locateHub, probeHub} from '../shared/discovery.mjs';

async function listen(hub) {
  await new Promise(resolve => hub.server.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${hub.server.address().port}`;
}

test('hub identity survives restart and address change; recovery ignores a different hub', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'barefit-discovery-'));
  t.after(() => rm(directory, {recursive:true, force:true}));
  const original = await createHub({directory});
  const oldBase = await listen(original);
  const identity = await probeHub(oldBase);
  assert.equal(identity.id, original.hubId);
  await original.close();
  const replacement = await createHub({directory});
  const newBase = await listen(replacement);
  t.after(() => replacement.close());
  const stranger = await createHub({persist:false});
  const strangerBase = await listen(stranger);
  t.after(() => stranger.close());
  assert.equal(replacement.hubId, identity.id);
  const result = await locateHub({base:oldBase, knownId:identity.id,
    discover:async () => [{url:strangerBase}, {url:newBase}]});
  assert.equal(result.base, newBase);
  assert.equal(result.id, identity.id);
  assert.equal(result.state, 'connected');
  const absent = await locateHub({base:strangerBase, knownId:identity.id,
    discover:async () => [{url:strangerBase}]});
  assert.equal(absent.state, 'offline');
});

test('first setup discovers one hub but never arbitrarily chooses between two', async () => {
  const a = {base:'http://192.168.1.2:4174',id:'a'.repeat(32)};
  const b = {base:'http://192.168.1.3:4174',id:'b'.repeat(32)};
  const probe = async base => [a,b].find(item => item.base === base) || null;
  const single = await locateHub({base:'', probe, discover:async () => [{url:a.base}, {url:a.base}]});
  assert.equal(single.base, a.base);
  const multiple = await locateHub({base:'', probe, discover:async () => [{url:a.base}, {url:b.base}]});
  assert.equal(multiple.state, 'ambiguous');
  let scanned = false;
  const connected = await locateHub({base:a.base, knownId:a.id, probe, discover:async () => {scanned=true;return [];}});
  assert.equal(connected.base, a.base);
  assert.equal(scanned, false);
});

test('an unreachable server stays offline and generic health endpoints are not BareFit', async () => {
  const result = await locateHub({base:'http://192.168.1.2:4174', knownId:'a'.repeat(32),
    probe:async () => null, discover:async () => []});
  assert.deepEqual(result, {state:'offline'});
  assert.equal(await probeHub('http://192.168.1.2', async () => ({ok:true,json:async () => ({ok:true})})), null);
  assert.equal(await probeHub('javascript:alert(1)', () => {throw Error('Must not fetch');}), null);
});

test('network QR addresses are refreshed rather than captured at startup', async t => {
  let ip = '192.168.1.2';
  const hub = await createHub({persist:false,studioUrls:() => [`http://${ip}:4174`]});
  const base = await listen(hub); t.after(() => hub.close());
  assert.deepEqual((await (await fetch(base+'/api/network')).json()).urls, ['http://192.168.1.2:4174']);
  ip = '192.168.1.9';
  assert.deepEqual((await (await fetch(base+'/api/network')).json()).urls, ['http://192.168.1.9:4174']);
});
