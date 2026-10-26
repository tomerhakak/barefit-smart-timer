import test from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { createHub } from "../server/hub.mjs";
import {WorkoutEngine,PRESETS} from '../shared/engine.mjs';
function inbox(ws) {
  const queue = [],
    waiters = [];
  ws.on("message", (raw) => {
    const m = JSON.parse(raw);
    const i = waiters.findIndex((w) => w.type === m.type);
    if (i >= 0) {
      const [w] = waiters.splice(i, 1);
      clearTimeout(w.timer);
      w.resolve(m);
    } else queue.push(m);
  });
  return (type) => {
    const i = queue.findIndex((m) => m.type === type);
    if (i >= 0) return Promise.resolve(queue.splice(i, 1)[0]);
    return new Promise((resolve, reject) => {
      const w = {
        type,
        resolve,
        timer: setTimeout(() => reject(Error("No message: " + type)), 3000),
      };
      waiters.push(w);
    });
  };
}
test('two studios isolate timers/settings, survive phone disconnect and reject duplicate displays',async(t)=>{
  const hub=await createHub({persist:false});
  await new Promise(resolve=>hub.server.listen(0,'127.0.0.1',resolve));t.after(()=>hub.close());
  const base=`http://127.0.0.1:${hub.server.address().port}`;
  const post=async(path,data)=>{const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});return {status:r.status,data:await r.json()};};
  const open=async(auth)=>{const ws=new WebSocket(base.replace('http','ws')+'/socket'),next=inbox(ws);await new Promise(r=>ws.once('open',r));const send=m=>ws.send(JSON.stringify(m));send({type:'auth',...auth});return {ws,next,send};};
  let now=0;
  const hosts=[],phones=[];
  for(const studioId of ['1','2']){
    const {data:credentials}=await post('/api/rooms',{});
    const host=await open({...credentials,role:'host',studioId});await host.next('authenticated');
    const engine=new WorkoutEngine({...PRESETS[0],prepare:0,work:45},()=>now);
    const settings={volume:0.8};
    host.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='command'){
      if(m.command==='SET_VOLUME')settings.volume=m.payload;else engine.command(m.command,m.payload);
      host.send({type:'state',state:{...engine.view(),studioId,studioSettings:settings}});
      host.send({type:'ack',id:m.id,ok:true});
    }});
    hosts.push({...host,credentials,engine,settings});
    const {data}=await post('/api/connect-studio',{studioId,name:'Coach '+studioId});
    const phone=await open({...data,role:'coach'});assert.equal((await phone.next('authenticated')).role,'controller');
    assert.equal((await phone.next('host-status')).online,true);phones.push({...phone,credentials:data});
  }
  assert.equal((await (await fetch(base+'/api/studios')).json()).studios.length,2);
  phones[0].send({type:'command',id:'studio1-start',sequence:1,command:'START'});assert.equal((await phones[0].next('ack')).ok,true);
  assert.equal(hosts[1].engine.view().status,'ready');
  phones[1].send({type:'command',id:'studio2-volume',sequence:1,command:'SET_VOLUME',payload:0.2});await phones[1].next('ack');
  assert.equal(hosts[0].settings.volume,0.8);assert.equal(hosts[1].settings.volume,0.2);
  phones[0].ws.close();now=5000;
  assert.equal(hosts[0].engine.view().remaining,40000);
  const reconnected=await open({...phones[0].credentials,role:'coach'});assert.equal((await reconnected.next('authenticated')).sequence,1);
  assert.equal((await reconnected.next('host-status')).online,true);
  const reused=await post('/api/connect-studio',{studioId:'1',existingToken:phones[0].credentials.token});
  assert.equal(reused.data.token,phones[0].credentials.token);assert.equal(hub.rooms.get(hosts[0].credentials.room).devices.length,1);
  const {data:duplicate}=await post('/api/rooms',{});
  const rejected=await open({...duplicate,role:'host',studioId:'1'});await rejected.next('error');
  assert.equal(hub.rooms.get(duplicate.room).host,null);
  const offline=reconnected.next('host-status');hosts[0].ws.close();assert.equal((await offline).online,false);
  const replacement=await open({...hosts[0].credentials,role:'host',studioId:'1'});await replacement.next('authenticated');
  assert.equal((await reconnected.next('host-status')).online,true);
  assert.equal(hosts[1].engine.view().status,'ready');
});
test("pair approval, control ownership, replay protection, reconnect and revoke", async (t) => {
  const hub = await createHub({ persist: false });
  await new Promise((r) => hub.server.listen(0, "127.0.0.1", r));
  t.after(() => hub.close());
  const base = `http://127.0.0.1:${hub.server.address().port}`;
  const post = async (url, data) => {
    const r = await fetch(base + url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    return { status: r.status, data: await r.json() };
  };
  const open = async (auth) => {
    const ws = new WebSocket(base.replace("http", "ws") + "/socket");
    const next = inbox(ws);
    await new Promise((r) => ws.once("open", r));
    ws.send(JSON.stringify({ type: "auth", ...auth }));
    return { ws, next, send: (m) => ws.send(JSON.stringify(m)) };
  };
  const { data: credentials } = await post("/api/rooms", {});
  const host = await open({ ...credentials, role: "host" });
  await host.next("authenticated");
  assert.equal(
    (await post("/api/pair", { room: credentials.room, code: "wrong" })).status,
    400,
  );
  async function pair(name) {
    host.send({ type: "new-code" });
    const code = await host.next("pair-code");
    const { data } = await post("/api/pair", {
      room: credentials.room,
      code: code.code,
      name,
    });
    assert.equal(
      (
        await post("/api/pair", {
          room: credentials.room,
          code: code.code,
          name,
        })
      ).status,
      400,
    );
    const pending = await open({ ...data, role: "pending" });
    await pending.next("waiting");
    const req = await host.next("pair-request");
    host.send({ type: "approve", id: req.id });
    const paired = await pending.next("paired");
    return {
      token: paired.token,
      room: credentials.room,
      role: "coach",
      expectedRole: paired.role,
      id: req.id,
    };
  }
  const auth = await pair("Coach");
  const coach = await open(auth);
  assert.equal((await coach.next("authenticated")).role, "controller");
  coach.send({ type: "command", id: "c1", sequence: 1, command: "START" });
  assert.equal((await host.next("command")).command, "START");
  host.send({ type: "ack", id: "c1", ok: true });
  assert.equal((await coach.next("ack")).ok, true);
  coach.send({ type: "command", id: "c1", sequence: 1, command: "START" });
  assert.equal((await coach.next("ack")).ok, true);
  coach.send({ type: "command", id: "c2", sequence: 1, command: "NEXT_PHASE" });
  assert.equal((await coach.next("ack")).ok, false);
  const second = await pair("Viewer");
  const viewer = await open(second);
  assert.equal((await viewer.next("authenticated")).role, "controller");
  assert.equal((await coach.next('role-update')).role,'viewer');
  coach.send({ type: "command", id: "v1", sequence: 2, command: "STOP" });
  assert.equal((await coach.next("ack")).ok, false);
  viewer.send({ type:'command',id:'new-coach',sequence:1,command:'SET_HALL',payload:false });
  assert.equal((await host.next('command')).command,'SET_HALL');
  host.send({type:'ack',id:'new-coach',ok:true});
  assert.equal((await viewer.next('ack')).ok,true);
  host.send({ type: "state", state: { remaining: 43210, status: "running" } });
  assert.equal((await coach.next("state")).state.remaining, 43210);
  coach.ws.close();
  const reconnect = await open(auth);
  assert.equal((await reconnect.next("authenticated")).sequence, 1);
  assert.equal((await reconnect.next("state")).state.remaining, 43210);
  host.send({ type: "revoke", id: auth.id });
  const close = await new Promise((r) =>
    reconnect.ws.once("close", (code) => r(code)),
  );
  assert.equal(close, 1008);
});
test("foreign browser origins are rejected", async (t) => {
  const hub = await createHub({ persist: false });
  await new Promise((r) => hub.server.listen(0, "127.0.0.1", r));
  t.after(() => hub.close());
  const r = await fetch(
    `http://127.0.0.1:${hub.server.address().port}/api/rooms`,
    {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  assert.equal(r.status, 403);
});

test('camera link pairs without approval, controls timer, reconnects, and rejects expired/reused/forged grants', async (t) => {
  const hub=await createHub({persist:false});
  await new Promise(resolve=>hub.server.listen(0,'127.0.0.1',resolve));
  t.after(()=>hub.close());
  const base=`http://127.0.0.1:${hub.server.address().port}`;
  const post=async(path,data)=>{
    const response=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
    return {status:response.status,data:await response.json()};
  };
  const open=async(auth)=>{
    const ws=new WebSocket(base.replace('http','ws')+'/socket'),next=inbox(ws);
    await new Promise(resolve=>ws.once('open',resolve));
    const send=m=>ws.send(JSON.stringify(m));
    send({type:'auth',...auth});
    return {ws,next,send};
  };
  const {data:credentials}=await post('/api/rooms',{});
  const host=await open({...credentials,role:'host'});
  await host.next('authenticated');
  host.send({type:'new-code'});
  const code=await host.next('pair-code');
  const payload={room:credentials.room,code:code.code,qrToken:code.qrToken,name:'Camera coach'};
  assert.equal((await post('/api/pair',{...payload,qrToken:'forged'})).status,400);
  const {status,data}=await post('/api/pair',payload);
  assert.equal(status,200);assert.equal(data.paired,true);
  assert.equal(hub.rooms.get(credentials.room).pending.size,0);
  assert.equal((await post('/api/pair',payload)).status,400);
  await host.next('pair-used');
  const device=(await host.next('devices')).devices[0];
  const phone=await open({...data,role:'coach'});
  assert.equal((await phone.next('authenticated')).role,'controller');
  phone.send({type:'command',id:'qr-start',sequence:1,command:'START'});
  assert.equal((await host.next('command')).command,'START');
  host.send({type:'ack',id:'qr-start',ok:true});
  assert.equal((await phone.next('ack')).ok,true);
  phone.ws.close();
  const reconnect=await open({...data,role:'coach'});
  assert.equal((await reconnect.next('authenticated')).sequence,1);
  host.send({type:'new-code'});
  const rescanCode=await host.next('pair-code');
  const rescan=await post('/api/pair',{...rescanCode,existingToken:data.token});
  assert.equal(rescan.data.token,data.token);
  assert.equal(hub.rooms.get(credentials.room).devices.length,1);
  host.send({type:'new-code'});
  const secondCode=await host.next('pair-code');
  const {data:second}=await post('/api/pair',{room:credentials.room,...secondCode,name:'Second phone'});
  const viewer=await open({...second,role:'coach'});
  assert.equal((await viewer.next('authenticated')).role,'controller');
  assert.equal((await reconnect.next('role-update')).role,'viewer');
  host.send({type:'new-code'});
  const expired=await host.next('pair-code');
  hub.rooms.get(credentials.room).pair.expires=Date.now()-1;
  assert.equal((await post('/api/pair',{...expired})).status,400);
  const closed=new Promise(resolve=>reconnect.ws.once('close',resolve));
  host.send({type:'revoke',id:device.id});
  assert.equal(await closed,1008);
});
