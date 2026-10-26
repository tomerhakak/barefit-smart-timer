import http from "node:http";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import {sendMessage} from '../shared/transport.mjs';
const token = () => randomBytes(32).toString("hex");
const hash = (s) => createHash("sha256").update(String(s)).digest("hex");
const same = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  a.length === b.length &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = sendMessage;
export async function createHub({
  directory = ".runtime",
  staticDir = "dist",
  persist = true,
  allowOrigins = [],
  studioUrls = [],
} = {}) {
  const rooms = new Map();
  const limits = new Map();
  let saving = Promise.resolve();
  let hubId = randomBytes(16).toString('hex');
  if (persist) {
    await mkdir(directory, { recursive: true });
    const identityFile = path.join(directory, 'hub-id');
    try {
      const savedId = (await readFile(identityFile, 'utf8')).trim();
      if (!/^[a-f0-9]{32}$/.test(savedId)) throw new Error('Invalid hub identity');
      hubId = savedId;
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      await writeFile(identityFile, hubId, {flag:'wx'});
    }
    try {
      const data = JSON.parse(
        await readFile(path.join(directory, "rooms.json"), "utf8"),
      );
      for (const r of data)
        rooms.set(r.id, {
          ...r,
          studioId:r.studioId||'1',studioName:r.studioName||`סטודיו ${r.studioId||'1'}`,
          host: null,
          clients: new Set(),
          pending: new Map(),
          inflight: new Map(),
          pair: null,
        });
    } catch (e) {
      if (e.code !== "ENOENT")
        console.warn(
          "Room recovery failed; old rooms will require pairing again.",
        );
    }
  }
  const save = () => {
    if (!persist) return;
    const data = JSON.stringify(
      [...rooms.values()].map((r) => ({
        id: r.id,
        studioId:r.studioId||'1',studioName:r.studioName||'סטודיו',
        hostHash: r.hostHash,
        devices: r.devices,
        acks: r.acks || [],
      })),
    );
    saving = saving
      .catch(() => {})
      .then(async () => {
        await writeFile(path.join(directory, "rooms.tmp"), data);
        await rename(
          path.join(directory, "rooms.tmp"),
          path.join(directory, "rooms.json"),
        );
      })
      .catch(() => console.error("Could not persist pairing permissions."));
  };
  const broadcast = (r, msg) => r.clients.forEach((ws) => send(ws, msg));
  const makeController=(room,device)=>{
    for(const other of room.devices){
      const role=other===device?'controller':'viewer';
      if(other.role===role)continue;
      other.role=role;
      for(const client of room.clients)if(client.deviceId===other.id){client.clientRole=role;send(client,{type:'role-update',role,sequence:other.sequence||0});}
    }
    save();
    send(room.host,{type:'devices',devices:room.devices.map(({id,name,role})=>({id,name,role}))});
  };
  const allowedOrigin = (req) =>
    !req.headers.origin ||
    req.headers.origin === `http://${req.headers.host}` ||
    req.headers.origin === `https://${req.headers.host}` ||
    allowOrigins.includes(req.headers.origin);
  const rate = (key, max = 30) => {
    const t = Date.now();
    let r = limits.get(key);
    if (!r || t - r.at > 60000) {
      r = { at: t, n: 0 };
      limits.set(key, r);
    }
    return ++r.n <= max;
  };
  const json = (res, status, data) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(data));
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        if (!allowedOrigin(req))
          return json(res, 403, { error: "Origin not allowed" });
        if (req.headers.origin) {
          res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
          res.setHeader("Vary", "Origin");
        }
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          });
          return res.end();
        }
        if (url.pathname === "/api/health") return json(res, 200, { ok: true, service:'barefit', hubId });
        if (url.pathname === "/api/network" && req.method === 'GET') return json(res, 200, {urls:typeof studioUrls === 'function' ? studioUrls() : studioUrls});
        if(url.pathname==='/api/studios'&&req.method==='GET'){
          const studios=[...rooms.values()].filter(r=>r.host&&['1','2'].includes(r.studioId)).map(r=>({id:r.studioId,name:r.studioName,online:true}));
          return json(res,200,{studios});
        }
        if (req.method !== "POST")
          return json(res, 405, { error: "POST required" });
        if (!String(req.headers["content-type"]).startsWith("application/json"))
          return json(res, 415, { error: "JSON required" });
        if (!rate(req.socket.remoteAddress, 40))
          return json(res, 429, { error: "Too many requests" });
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (body.length > 16384)
            return json(res, 413, { error: "Payload too large" });
        }
        const data = JSON.parse(body || "{}");
        if(url.pathname==='/api/connect-studio'){
          if(!['1','2'].includes(data.studioId))return json(res,400,{error:'בחרו סטודיו 1 או 2'});
          const room=[...rooms.values()].find(r=>r.host&&r.studioId===data.studioId);
          if(!room)return json(res,404,{error:`סטודיו ${data.studioId} אינו מחובר כרגע`});
          const existing=typeof data.existingToken==='string'&&room.devices.find(d=>same(d.hash,hash(data.existingToken)));
          if(existing){makeController(room,existing);return json(res,200,{room:room.id,token:data.existingToken,paired:true,studioId:room.studioId});}
          const name=String(data.name||'מאמן').trim().slice(0,60)||'מאמן';
          const previous=room.devices.find(d=>d.role==='controller');
          if(previous){previous.role='viewer';for(const client of room.clients)if(client.deviceId===previous.id){client.clientRole='viewer';send(client,{type:'role-update',role:'viewer'});}}
          const deviceToken=token();
          const device={id:randomBytes(8).toString('hex'),name,hash:hash(deviceToken),role:'controller',sequence:0};
          room.devices.push(device);save();
          send(room.host,{type:'pair-used',name});
          send(room.host,{type:'devices',devices:room.devices.map(({id,name,role})=>({id,name,role}))});
          return json(res,200,{room:room.id,token:deviceToken,paired:true,studioId:room.studioId});
        }
        if (url.pathname === "/api/rooms") {
          if (rooms.size >= 100)
            return json(res, 503, { error: "Room limit reached" });
          const id = randomBytes(5).toString("hex"),
            hostToken = token();
          rooms.set(id, {
            id,
            hostHash: hash(hostToken),
            devices: [],
            acks: [],
            host: null,
            clients: new Set(),
            pending: new Map(),
            inflight: new Map(),
            pair: null,
          });
          save();
          return json(res, 201, { room: id, token: hostToken });
        }
        if (url.pathname === "/api/pair") {
          const room = rooms.get(data.room);
          if (
            !room?.host ||
            !room.pair ||
            room.pair.expires < Date.now() ||
            !same(room.pair.code, String(data.code))
          )
            return json(res, 400, { error: "קוד החיבור פג תוקף או אינו תקין" });
          // Only the high-entropy capability in the displayed QR grants automatic access.
          // A manually entered short code still requires the host's approval.
          if (data.qrToken !== undefined) {
            if (!same(room.pair.qrToken, data.qrToken))
              return json(res, 400, { error: "קישור החיבור אינו תקין. סרקו קוד חדש מהמסך." });
            const existing = typeof data.existingToken === 'string' && room.devices.find(d=>same(d.hash,hash(data.existingToken)));
            if (existing) {
              room.pair = null;
              makeController(room,existing);
              send(room.host, {type:'pair-used',name:existing.name});
              return json(res,200,{room:room.id,token:data.existingToken,paired:true});
            }
            const deviceToken = token();
            const previous = room.devices.find(d=>d.role==='controller');
            if(previous){
              previous.role='viewer';
              for(const client of room.clients)if(client.deviceId===previous.id){client.clientRole='viewer';send(client,{type:'role-update',role:'viewer'});}
            }
            const device = {
              id: randomBytes(8).toString("hex"),
              name: String(data.name || "טלפון המאמן").trim().slice(0, 60),
              hash: hash(deviceToken),
              role: "controller",
              sequence: 0,
            };
            room.pair = null;
            room.devices.push(device);
            save();
            send(room.host, { type: "pair-used", name: device.name });
            send(room.host, { type: "devices", devices: room.devices.map(({id,name,role})=>({id,name,role})) });
            return json(res, 200, { room: room.id, token: deviceToken, paired: true });
          }
          if (room.pending.size >= 5)
            return json(res, 429, { error: "יותר מדי בקשות ממתינות" });
          const request = token(),
            id = randomBytes(8).toString("hex");
          const name = String(data.name || "טלפון המאמן")
            .trim()
            .slice(0, 60);
          room.pending.set(id, {
            hash: hash(request),
            name,
            expires: Date.now() + 120000,
            ws: null,
          });
          room.pair = null;
          send(room.host, { type: "pair-request", id, name });
          return json(res, 200, { room: room.id, id, token: request });
        }
        return json(res, 404, { error: "Not found" });
      }
      if (req.method !== "GET")
        return json(res, 405, { error: "GET required" });
      let relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
      if (!relative || relative === "coach") relative = "index.html";
      const root = path.resolve(staticDir);
      const file = path.resolve(root, relative);
      if (file !== root && !file.startsWith(root + path.sep))
        return json(res, 403, { error: "Forbidden" });
      const mime = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".webmanifest": "application/manifest+json",
        ".json": "application/json",
        ".wav": "audio/wav",
      };
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control":
          relative === "index.html" || relative === "sw.js"
            ? "no-cache"
            : "public,max-age=3600",
      });
      res.end(content);
    } catch (e) {
      json(res, e.code === "ENOENT" ? 404 : 400, {
        error: e.code === "ENOENT" ? "Not found" : "Invalid request",
      });
    }
  });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 65536 });
  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/socket" || !allowedOrigin(req)) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) =>
      wss.emit("connection", ws, req),
    );
  });
  wss.on("connection", (ws, req) => {
    let room = null,
      role = null,
      device = null;
    const timeout = setTimeout(
      () => ws.close(1008, "Authentication required"),
      5000,
    );
    ws.isAlive = true;
    ws.on("pong", () => (ws.isAlive = true));
    ws.on("message", (raw) => {
      try {
        if (!rate(`ws:${req.socket.remoteAddress}`, 1200))
          return ws.close(1008, "Rate limit");
        const m = JSON.parse(raw);
        if (!room) {
          if (m.type !== "auth") return ws.close(1008, "Auth required");
          const r = rooms.get(m.room);
          if (!r) return ws.close(1008, "Unknown room");
          if (m.role === "host" && same(r.hostHash, hash(m.token))) {
            const studioId=String(m.studioId||r.studioId||'1');
            if(!['1','2'].includes(studioId))return ws.close(1008,'Invalid studio ID');
            const conflict=[...rooms.values()].find(other=>other!==r&&other.host&&other.studioId===studioId);
            if(conflict){send(ws,{type:'error',error:`סטודיו ${studioId} כבר מחובר למסך אחר`});return ws.close(1008,'Studio already active');}
            if (r.host && r.host !== ws) r.host.close(4001, "Replaced");
            r.host = ws;
            room = r;
            r.studioId=studioId;r.studioName=`סטודיו ${studioId}`;
            save();
            role = "host";
            ws.clientRole = role;
            send(ws, {
              type: "authenticated",
              role,
              devices: r.devices.map((d) => ({
                id: d.id,
                name: d.name,
                role: d.role,
              })),
            });
            for (const [id, p] of r.pending)
              if (p.expires > Date.now())
                send(ws, { type: "pair-request", id, name: p.name });
            broadcast(r, {type:'host-status', online:true});
          } else if (m.role === "pending") {
            const p = r.pending.get(m.id);
            if (!p || p.expires < Date.now() || !same(p.hash, hash(m.token)))
              return ws.close(1008, "Expired pairing");
            room = r;
            role = "pending";
            ws.clientRole = role;
            device = { id: m.id };
            p.ws = ws;
            send(ws, { type: "waiting" });
          } else {
            const d = r.devices.find((d) => same(d.hash, hash(m.token)));
            if (!d) return ws.close(1008, "Unauthorized");
            room = r;
            device = d;
            role = d.role;
            ws.clientRole = role;
            ws.deviceId = d.id;
            r.clients.add(ws);
            send(ws, {
              type: "authenticated",
              role,
              device: d.id,
              sequence: d.sequence || 0,
            });
            if (r.state) send(ws, { type: "state", state: r.state });
            send(ws, { type: "host-status", online: !!r.host });
          }
          clearTimeout(timeout);
          return;
        }
        if (role === "host") {
          if (room.host !== ws) return;
          if (m.type === "state") {
            if (!m.state || typeof m.state.remaining !== "number") return;
            room.state = m.state;
            broadcast(room, { type: "state", state: m.state });
          } else if (m.type === "new-code") {
            room.pair = {
              code: randomBytes(4).toString("hex"),
              qrToken: token(),
              expires: Date.now() + 120000,
            };
            send(ws, { type: "pair-code", room: room.id, ...room.pair });
          } else if (m.type === "approve" || m.type === "reject") {
            const p = room.pending.get(m.id);
            if (!p) return;
            if (m.type === "reject" || p.expires < Date.now()) {
              send(p.ws, { type: "rejected" });
              p.ws?.close();
              room.pending.delete(m.id);
              return;
            }
            if (!p.ws || p.ws.readyState !== WebSocket.OPEN)
              return send(ws, {
                type: "error",
                error: "הטלפון התנתק. יש לסרוק שוב",
              });
            const t = token();
            const previousController=room.devices.find(d=>d.role==='controller');
            if(previousController){previousController.role='viewer';for(const client of room.clients)if(client.deviceId===previousController.id){client.clientRole='viewer';send(client,{type:'role-update',role:'viewer'});}}
            const d = {
              id: m.id,
              name: p.name,
              hash: hash(t),
              role: "controller",
              sequence: 0,
            };
            room.devices.push(d);
            send(p.ws, { type: "paired", token: t, role: d.role });
            p.ws.close(1000, "Paired");
            room.pending.delete(m.id);
            save();
            send(ws, {
              type: "devices",
              devices: room.devices.map(({ id, name, role }) => ({
                id,
                name,
                role,
              })),
            });
          } else if (m.type === "revoke") {
            const d = room.devices.find((d) => d.id === m.id);
            if (d) {
              room.devices = room.devices.filter(
                (d) => d !== m.id && d.id !== m.id,
              );
              for (const c of room.clients)
                if (c.deviceId === m.id) c.close(1008, "Revoked");
              save();
              send(ws, {
                type: "devices",
                devices: room.devices.map(({ id, name, role }) => ({
                  id,
                  name,
                  role,
                })),
              });
            }
          } else if (m.type === "ack") {
            const item = room.inflight.get(m.id);
            if (!item) return;
            room.inflight.delete(m.id);
            clearTimeout(item.timer);
            const ack = {
              type: "ack",
              id: m.id,
              ok: !!m.ok,
              error: String(m.error || "").slice(0, 200),
            };
            room.acks.push({ deviceId: item.deviceId, ...ack });
            if (room.acks.length > 500) room.acks.shift();
            send(item.ws, ack);
            save();
          }
        } else if (device && m.type === 'command' && device.role !== 'controller') {
          send(ws,{type:'ack',id:m.id,ok:false,error:'מכשיר זה במצב צפייה בלבד'});
        } else if (ws.clientRole === "controller" && m.type === "command") {
          const d = room.devices.find((d) => d.id === device.id);
          if (!d) return ws.close(1008, "Revoked");
          if (
            typeof m.id !== "string" ||
            m.id.length > 100 ||
            !Number.isInteger(m.sequence)
          )
            throw Error("Invalid command");
          const ack = room.acks.find(
            (a) => a.deviceId === d.id && a.id === m.id,
          );
          if (ack) return send(ws, ack);
          if (room.inflight.has(m.id)) return;
          if (m.sequence <= d.sequence)
            return send(ws, {
              type: "ack",
              id: m.id,
              ok: false,
              error: "פקודה ישנה נדחתה",
            });
          if (!room.host)
            return send(ws, {
              type: "ack",
              id: m.id,
              ok: false,
              error: "המסך אינו מחובר",
            });
          if (
            ![
              "START",
              "PAUSE",
              "RESUME",
              "STOP",
              "NEXT_PHASE",
              "PREVIOUS_PHASE",
              "LOAD_WORKOUT",
              "UPDATE_WORKOUT",
              "GET_STATUS",
              "SET_VOLUME",
              "SET_VOICE",
              "SET_COUNTDOWN",
              "SET_MUTE",
              "SET_HALL",
              "SET_CLEAN",
            ].includes(m.command)
          )
            throw Error("Invalid command");
          d.sequence = m.sequence;
          save();
          const item = {
            ws,
            deviceId: d.id,
            timer: setTimeout(() => {
              room.inflight.delete(m.id);
              send(ws, {
                type: "ack",
                id: m.id,
                ok: false,
                error: "לא התקבל אישור מהמסך; בדקו את מצב האימון",
              });
            }, 5000),
          };
          room.inflight.set(m.id, item);
          send(room.host, {
            type: "command",
            id: m.id,
            command: m.command,
            payload: m.payload,
          });
        } else if (m.type === "command")
          send(ws, {
            type: "ack",
            id: m.id,
            ok: false,
            error: "מכשיר זה במצב צפייה בלבד",
          });
        ws.deviceId = device?.id;
      } catch {
        send(ws, { type: "error", error: "הודעה לא תקינה" });
      }
    });
    ws.on("close", () => {
      clearTimeout(timeout);
      if (room) {
        room.clients.delete(ws);
        if (room.host === ws) {
          room.host = null;
          broadcast(room, { type: "host-status", online: false });
        }
        if (role === "pending") {
          const p = room.pending.get(device.id);
          if (p?.ws === ws) p.ws = null;
        }
      }
    });
    ws.on("error", () => {});
  });
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
    for (const r of rooms.values())
      for (const [id, p] of r.pending)
        if (p.expires < Date.now()) {
          send(p.ws, { type: "rejected" });
          p.ws?.close();
          r.pending.delete(id);
        }
    for (const [k, v] of limits)
      if (Date.now() - v.at > 60000) limits.delete(k);
  }, 15000);
  return {
    server,
    hubId,
    rooms,
    close: async () => {
      clearInterval(heartbeat);
      for (const r of rooms.values())
        for (const i of r.inflight.values()) clearTimeout(i.timer);
      for (const ws of wss.clients) ws.terminate();
      wss.close();
      await saving;
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
