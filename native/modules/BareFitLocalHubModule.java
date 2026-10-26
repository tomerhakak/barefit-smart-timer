package com.barefit.localhub;

import android.content.Context;
import android.content.SharedPreferences;
import com.facebook.react.bridge.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ConcurrentHashMap;
import org.json.*;

/** A small, foreground LAN hub hosted by the Android TV itself. */
public final class BareFitLocalHubModule extends ReactContextBaseJavaModule implements LifecycleEventListener {
  private static final String MAGIC = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  private final Context context;
  private final SharedPreferences prefs;
  private volatile Hub hub;

  public BareFitLocalHubModule(ReactApplicationContext c) {
    super(c); context = c.getApplicationContext();
    prefs = context.getSharedPreferences("barefit-local-hub", Context.MODE_PRIVATE);
    c.addLifecycleEventListener(this);
  }
  @Override public String getName() { return "BareFitLocalHub"; }

  @ReactMethod public void start(String studio, Promise promise) {
    try {
      String id = ("2".equals(studio) ? "2" : "1");
      synchronized (this) {
        if (hub == null || !hub.studio.equals(id)) { if (hub != null) hub.close(); hub = new Hub(id); hub.start(); }
      }
      WritableMap out = Arguments.createMap();
      out.putString("base", hub.base);
      out.putString("room", hub.room);
      out.putString("token", hub.hostToken);
      out.putString("hubId", hub.hubId);
      promise.resolve(out);
    } catch (Exception e) { promise.reject("LOCAL_HUB", e.getMessage(), e); }
  }
  @ReactMethod public void stop() { synchronized (this) { if (hub != null) { hub.close(); hub = null; } } }
  @Override public void onHostPause() { }
  @Override public void onHostResume() { }
  @Override public void onHostDestroy() { stop(); }
  @Override public void invalidate() { stop(); getReactApplicationContext().removeLifecycleEventListener(this); super.invalidate(); }

  private final class Hub {
    final String studio, room, hostToken, hubId;
    final String hostKey, roomKey;
    final CopyOnWriteArrayList<Peer> peers = new CopyOnWriteArrayList<>();
    final Map<String, Peer> inflight = new ConcurrentHashMap<>();
    volatile String state;
    volatile String pairCode, pairQr;
    volatile long pairExpires;
    ServerSocket server;
    Thread acceptThread;
    String base;
    Hub(String id) {
      studio = id;
      roomKey = "room_" + id; hostKey = "host_" + id;
      room = value(roomKey, hex(5)); hostToken = value(hostKey, hex(32));
      hubId = value("hub-id", hex(16));
    }
    void start() throws IOException {
      server = new ServerSocket();
      server.setReuseAddress(true);
      server.bind(new InetSocketAddress("0.0.0.0", 4174), 24);
      base = "http://" + localAddress() + ":" + server.getLocalPort();
      acceptThread = new Thread(() -> { while (!server.isClosed()) try { new Peer(server.accept()).start(); } catch (IOException ignored) { } }, "barefit-local-hub");
      acceptThread.setDaemon(true); acceptThread.start();
    }
    void close() { try { if (server != null) server.close(); } catch (IOException ignored) {} for (Peer p: peers) p.close(); peers.clear(); }
    String value(String key, String fallback) { String s=prefs.getString(key,null); if (s==null) { s=fallback; prefs.edit().putString(key,s).apply(); } return s; }
    String localAddress() {
      try { Enumeration<NetworkInterface> ns=NetworkInterface.getNetworkInterfaces(); while(ns.hasMoreElements()){ NetworkInterface n=ns.nextElement(); if(!n.isUp()||n.isLoopback())continue; Enumeration<InetAddress> as=n.getInetAddresses(); while(as.hasMoreElements()){ InetAddress a=as.nextElement(); if(a instanceof Inet4Address && !a.isLoopbackAddress()) return a.getHostAddress(); }} } catch(Exception ignored) {} return "127.0.0.1";
    }
    void send(Peer p, JSONObject m) { if (p != null) p.write(m.toString()); }
    void broadcast(JSONObject m) { for(Peer p:peers) if("coach".equals(p.role)) send(p,m); }
    JSONObject devices() { JSONArray a=new JSONArray(); String h=prefs.getString("coach-name_"+studio,null), t=prefs.getString("coach-token_"+studio,null); if(t!=null){ JSONObject d=new JSONObject(); try{d.put("id", "controller-"+studio);d.put("name",h==null?"טלפון המאמן":h);d.put("role","controller");a.put(d);}catch(Exception ignored){} } try{return new JSONObject().put("devices",a);}catch(Exception e){return new JSONObject();} }
    void pair(String name) { pairCode=hex(4); pairQr=hex(32); pairExpires=System.currentTimeMillis()+120000; JSONObject m=new JSONObject(); try{m.put("type","pair-code");m.put("room",room);m.put("code",pairCode);m.put("qrToken",pairQr);m.put("expires",pairExpires);}catch(Exception ignored){} send(host(),m); }
    Peer host(){for(Peer p:peers)if("host".equals(p.role))return p;return null;}
    String newToken(){return hex(32);}
    JSONObject json(String type) { try{return new JSONObject().put("type",type);}catch(Exception e){return new JSONObject();} }

    final class Peer extends Thread {
      final Socket socket; InputStream in; OutputStream out; volatile boolean closed; String role; String deviceToken;
      Peer(Socket s){super("barefit-peer");socket=s;setDaemon(true);}
      void startPeer(){start();}
      @Override public void run(){ try { socket.setSoTimeout(30000); in=socket.getInputStream();out=socket.getOutputStream(); String head=readHeader(); if(head==null)return; if(head.toLowerCase(Locale.US).contains("upgrade: websocket")){ handshake(head); socket.setSoTimeout(0); peers.add(this); wsLoop(); } else http(head); } catch(Exception ignored){} finally{close();} }
      void http(String h) throws Exception { String[] first=h.split("\r\n")[0].split(" "); String method=first[0], path=first[1]; int len=headerInt(h,"content-length"); byte[] body=readBytes(len); String text=new String(body,StandardCharsets.UTF_8); JSONObject d=text.isEmpty()?new JSONObject():new JSONObject(text); String p=path.split("\\?",2)[0];
        JSONObject r=new JSONObject(); int code=200;
        if("OPTIONS".equals(method)){writeHttp(204,new JSONObject().toString());return;}
        if("GET".equals(method)&&"/api/health".equals(p)){r.put("ok",true).put("service","barefit").put("hubId",hubId);}
        else if("GET".equals(method)&&"/api/network".equals(p)){r.put("urls",new JSONArray().put(base));}
        else if("GET".equals(method)&&"/api/studios".equals(p)){r.put("studios",new JSONArray().put(new JSONObject().put("id",studio).put("name","סטודיו "+studio).put("online",host()!=null)));}
        else if("POST".equals(method)&&"/api/rooms".equals(p)){r.put("room",room).put("token",hostToken);code=200;}
        else if("POST".equals(method)&&"/api/connect-studio".equals(p)){ if(!studio.equals(d.optString("studioId"))) {code=404;r.put("error","סטודיו אינו זמין");} else {String old=d.optString("existingToken","");String ct=prefs.getString("coach-token_"+studio,null);String tok=old.length()>0&&old.equals(ct)?old:pairToken(d.optString("name","מאמן"));r.put("room",room).put("token",tok).put("paired",true).put("studioId",studio);} }
        else if("POST".equals(method)&&"/api/pair".equals(p)){ if(!room.equals(d.optString("room"))||pairCode==null||pairExpires<System.currentTimeMillis()||!pairCode.equals(d.optString("code"))||(d.has("qrToken")&&!pairQr.equals(d.optString("qrToken")))){code=400;r.put("error","קוד החיבור פג תוקף או אינו תקין");}else{String old=d.optString("existingToken","");String tok=old.length()>0&&old.equals(prefs.getString("coach-token_"+studio,null))?old:pairToken(d.optString("name","טלפון המאמן")); pairCode=null;pairQr=null;r.put("room",room).put("token",tok).put("paired",true).put("studioId",studio);send(host(),json("pair-used").put("name",d.optString("name","טלפון המאמן")));send(host(),devices());}}
        else {code=404;r.put("error","Not found");}
        writeHttp(code,r.toString());
      }
      String pairToken(String name){String t=newToken();prefs.edit().putString("coach-token_"+studio,t).putString("coach-name_"+studio,name).apply();return t;}
      void wsLoop() throws Exception { while(!closed){ byte[] frame=readFrame();if(frame==null)return;String msg=new String(frame,StandardCharsets.UTF_8);JSONObject m=new JSONObject(msg); if(role==null){ if(!"auth".equals(m.optString("type")))return;String rr=m.optString("role");if("host".equals(rr)&&room.equals(m.optString("room"))&&hostToken.equals(m.optString("token"))){if(host()!=null&&host()!=this)host().close();role="host";send(this,json("authenticated").put("role","host").put("devices",devices().getJSONArray("devices")));broadcast(json("host-status").put("online",true)); if(state!=null)send(this,new JSONObject().put("type","state").put("state",new JSONObject(state)));}else if(("coach".equals(rr))&&room.equals(m.optString("room"))&&m.optString("token").equals(prefs.getString("coach-token_"+studio,null))){role="coach";deviceToken=m.optString("token");send(this,json("authenticated").put("role","controller").put("device","controller-"+studio).put("sequence",0));if(state!=null)send(this,new JSONObject().put("type","state").put("state",new JSONObject(state)));send(this,json("host-status").put("online",host()!=null));}else return;continue;}
          if("host".equals(role)){ if("state".equals(m.optString("type"))&&m.has("state")){state=m.getJSONObject("state").toString();broadcast(m);} else if("new-code".equals(m.optString("type")))pair("טלפון המאמן"); else if("ack".equals(m.optString("type"))){Peer p=inflight.remove(m.optString("id"));if(p!=null)send(p,m);} }
          else if("coach".equals(role)&&"command".equals(m.optString("type"))){Peer h=host();if(h==null){send(this,json("ack").put("id",m.optString("id")).put("ok",false).put("error","המסך אינו מחובר"));}else{inflight.put(m.optString("id"),this);JSONObject cmd=new JSONObject().put("type","command").put("id",m.optString("id")).put("command",m.optString("command"));if(m.has("payload"))cmd.put("payload",m.get("payload"));send(h,cmd);}}
        }}
      String readHeader() throws Exception {ByteArrayOutputStream b=new ByteArrayOutputStream();int last=0,c;while((c=in.read())!=-1){b.write(c);int n=b.size();if(n>65536)throw new IOException();byte[] x=b.toByteArray();if(n>=4&&x[n-4]=='\r'&&x[n-3]=='\n'&&x[n-2]=='\r'&&x[n-1]=='\n')return b.toString("ISO-8859-1");}return null;}
      int headerInt(String h,String key){for(String l:h.split("\r\n"))if(l.toLowerCase(Locale.US).startsWith(key+":"))try{return Integer.parseInt(l.substring(l.indexOf(':')+1).trim());}catch(Exception ignored){}return 0;}
      byte[] readBytes(int n)throws IOException{byte[] b=new byte[n];int p=0,r;while(p<n&&(r=in.read(b,p,n-p))>0)p+=r;return b;}
      void handshake(String h)throws Exception{String key="";for(String l:h.split("\r\n"))if(l.toLowerCase(Locale.US).startsWith("sec-websocket-key:"))key=l.substring(l.indexOf(':')+1).trim();String accept=Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-1").digest((key+MAGIC).getBytes(StandardCharsets.US_ASCII)));String out="HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: "+accept+"\r\n\r\n";this.out.write(out.getBytes(StandardCharsets.US_ASCII));this.out.flush();}
      byte[] readFrame()throws IOException{int a=in.read(),b=in.read();if(a<0||b<0)return null;int len=b&127;if(len==126){len=((in.read()&255)<<8)|(in.read()&255);}else if(len==127){for(int i=0;i<4;i++)in.read();len=0;for(int i=0;i<4;i++)len=(len<<8)|(in.read()&255);}byte[] mask=new byte[4];if((b&128)!=0)readFully(mask);byte[] d=new byte[len];readFully(d);if((b&128)!=0)for(int i=0;i<len;i++)d[i]=(byte)(d[i]^mask[i%4]);if((a&15)==8)return null;if((a&15)==9)writeFrame(d,10);return d;}
      void readFully(byte[] b)throws IOException{int p=0,n;while(p<b.length&&(n=in.read(b,p,b.length-p))>0)p+=n;if(p<b.length)throw new EOFException();}
      synchronized void write(String s){try{writeFrame(s.getBytes(StandardCharsets.UTF_8),1);}catch(Exception ignored){close();}}
      synchronized void writeFrame(byte[] d,int op)throws IOException{int n=d.length;out.write(0x80|op);if(n<126)out.write(n);else if(n<=65535){out.write(126);out.write((n>>8)&255);out.write(n&255);}else throw new IOException();out.write(d);out.flush();}
      void writeHttp(int status,String body)throws IOException{byte[] b=body.getBytes(StandardCharsets.UTF_8);String h="HTTP/1.1 "+status+" OK\r\nContent-Type: application/json\r\nContent-Length: "+b.length+"\r\nCache-Control: no-store\r\nAccess-Control-Allow-Origin: *\r\nConnection: close\r\n\r\n";out.write(h.getBytes(StandardCharsets.US_ASCII));out.write(b);out.flush();}
      void close(){if(closed)return;closed=true;peers.remove(this);if("host".equals(role)){try{broadcast(json("host-status").put("online",false));}catch(Exception ignored){}}try{socket.close();}catch(Exception ignored){}}
    }
  }
  static String hex(int bytes){byte[] b=new byte[bytes];new java.security.SecureRandom().nextBytes(b);StringBuilder s=new StringBuilder(bytes*2);for(byte x:b)s.append(String.format(Locale.US,"%02x",x));return s.toString();}
}
