import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  StyleSheet,
  ImageBackground,
  TextInput,
  ScrollView,
  Modal,
  Platform,
  Alert,
  AppState,
  NativeModules,
  TVEventHandler,
  useWindowDimensions,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import QRCode from "react-native-qrcode-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFonts } from "expo-font";
import { useKeepAwake } from "expo-keep-awake";
import { CueTracker, roundNotice, countdownWindow } from "../shared/cues.mjs";
import { NativeCoachAudio } from "./coachAudio";
import PhoneScanner from "./PhoneScanner";
import {useHubDiscovery} from './useHubDiscovery';
import { pairLink } from "../shared/pairing.mjs";
import {
  WorkoutEngine,
  PRESETS,
  LABELS,
  formatTime,
  validateWorkout,
} from "../shared/engine.mjs";
import { Connection, request, commandId } from "../shared/connection.mjs";
import { normalizeSettings, SETTING_COMMANDS, SettingsSync } from '../shared/settings.mjs';
const lime = "#b4ff00";
const colors = {
  ready: lime,
  work: lime,
  prepare: "#57b7ff",
  rest: "#ffb146",
  between: "#ffb146",
  finished: lime,
};
const load = async (k, f = null) => {
  try {
    return JSON.parse(await AsyncStorage.getItem(k)) ?? f;
  } catch {
    return f;
  }
};
let writes = Promise.resolve();
const save = (k, v) => {
  const data = JSON.stringify(v);
  writes = writes.catch(() => {}).then(() => AsyncStorage.setItem(k, data));
  return writes;
};
function Action({ children, onPress, primary = false, disabled = false, camera = false, preferredFocus = false }: any) {
  const [focus, setFocus] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      onPress={onPress}
      disabled={disabled}
      hasTVPreferredFocus={Platform.isTV && preferredFocus && !disabled}
      style={[
        s.button,
        primary && s.primary,
        focus && s.focus,
        disabled && { opacity: 0.35 },
      ]}
    >
      {camera && <Svg width={25} height={23} viewBox="0 0 24 24" style={{alignSelf:'center',marginBottom:4}}>
        <Path d="M3 7h4l2-3h6l2 3h4v13H3Z" fill="none" stroke={primary?'#111807':'white'} strokeWidth={2}/>
        <Circle cx={12} cy={13} r={4} fill="none" stroke={primary?'#111807':'white'} strokeWidth={2}/>
      </Svg>}
      <Text style={[s.buttonText, primary && { color: "#111807" }]}>
        {children}
      </Text>
    </Pressable>
  );
}
function HallFace({view, width, height}: any) {
  const phase = colors[view.phase] || lime;
  const remaining = view.status === 'ready' ? view.workout.work*1000 : view.remaining;
  const closing = view.status === 'running' && remaining <= countdownWindow(view)*1000;
  return <View style={{width:width*.94,alignItems:'center',paddingVertical:10}}>
    <Text style={{fontFamily:'Heebo',fontSize:Math.min(height*.065,width*.1),fontWeight:'900',color:phase}}>{view.status === 'paused' ? 'השהיה' : view.label || LABELS[view.phase]}</Text>
    <Text style={{fontFamily:'Anton',fontSize:Math.min(width*(remaining>=6000000?.24:.3),height*.38),color:closing?phase:'white',writingDirection:'ltr'}}>{view.status==='finished'?'✓':formatTime(remaining)}</Text>
    {!!roundNotice(view) && <Text style={{fontFamily:'Heebo',fontWeight:'900',color:phase,fontSize:Math.min(height*.034,26)}}>{roundNotice(view)}</Text>}
    <Text style={{fontFamily:'Heebo',color:'white',fontSize:Math.min(height*.04,32)}}>סבב {view.round} / {view.workout.rounds}   ·   סט {view.set} / {view.workout.sets}</Text>
    <View style={{height:8,width:'100%',backgroundColor:'#30392b',marginTop:16,alignItems:'flex-start'}}><View style={{height:8,width:`${view.status==='ready'?100:view.progress*100}%`,backgroundColor:phase}} /></View>
  </View>;
}
function Face({ view, size }: any) {
  const c = colors[view.phase] || lime;
  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#040800ed",
        borderRadius: size / 2,
      }}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.48}
          stroke={c}
          strokeWidth={1}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.45}
          stroke="#28311c"
          strokeWidth={size * 0.042}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={size * 0.45}
          stroke={c}
          strokeWidth={size * 0.042}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={[
            Math.PI *
              size *
              0.9 *
              (view.status === "ready" ? 1 : view.progress),
            Math.PI * size * 0.9,
          ]}
          rotation={-90}
          origin={`${size / 2},${size / 2}`}
        />
      </Svg>
      <Text
        style={{
          fontFamily: "Heebo",
          fontWeight: "900",
          fontSize: size * 0.12,
          color: c,
        }}
      >
        {view.status === "paused" ? "השהיה" : view.label || LABELS[view.phase]}
      </Text>
      <Text
        style={{
          fontFamily: "Anton",
          fontSize: size * 0.29,
          color: "white",
          lineHeight: size * 0.36,
        }}
      >
        {view.status === "finished"
          ? "✓"
          : formatTime(
              view.status === "ready"
                ? view.workout.work * 1000
                : view.remaining,
            )}
      </Text>
      <View
        style={{
          width: size * 0.24,
          height: size * 0.24,
          borderRadius: size * 0.12,
          borderColor: c,
          borderWidth: 2,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Text
          style={{
            color: "white",
            fontFamily: "Heebo",
            fontSize: size * 0.036,
          }}
        >
          סבב
        </Text>
        <Text
          style={{
            color: "white",
            fontFamily: "Anton",
            fontSize: size * 0.083,
          }}
        >
          {view.round}/{view.workout.rounds}
        </Text>
      </View>
      <Text style={{ color: "#b3bca6", fontSize: size * 0.023, marginTop: 10 }}>
        סט {view.set} מתוך {view.workout.sets}
      </Text>
    </View>
  );
}
export default function App() {
  useKeepAwake();
  const [fonts] = useFonts({
    Anton: require("../public/assets/Anton-Regular.ttf"),
    Heebo: require("../public/assets/Heebo.ttf"),
  });
  const { width, height } = useWindowDimensions();
  const isTV = Platform.isTV;
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState(isTV ? "display" : "coach"),
    [base, setBase] = useState(""),
    [studioId,setStudioId] = useState('1'),
    [studios,setStudios] = useState([]),
    [draftBase, setDraftBase] = useState(""),
    [view, setView] = useState(null),
    [remoteView, setRemoteView] = useState(null),
    [status, setStatus] = useState("disconnected"),
    [role, setRole] = useState("viewer"),
    [hostOnline, setHostOnline] = useState(false),
    [code, setCode] = useState(null),
    [pendingPair, setPendingPair] = useState(null),
    [panel, setPanel] = useState(null),
    [error, setError] = useState(""),
    [programs, setPrograms] = useState(PRESETS),
    [workout, setWorkout] = useState(null),
    [muted, setMuted] = useState(false),
    [hall, setHall] = useState(true),
    [clean,setClean] = useState(false),
    [voice, setVoice] = useState(true),
    [volume, setVolume] = useState(0.8),
    [countdown, setCountdown] = useState(10),
    [room, setRoom] = useState(""),
    [pairCode, setPairCode] = useState(""),
    [creds, setCreds] = useState(null),
    [waiting, setWaiting] = useState(false),
    [pendingCommand, setPendingCommand] = useState(null),
    [devices, setDevices] = useState([]);
  const pairing=useRef(false), skipCoachLoad=useRef("");
  const engine = useRef(new WorkoutEngine()),
    connection = useRef(null),
    sequence = useRef(0),
    processed = useRef([]),
    mutedRef = useRef(false);
  mutedRef.current = muted;
  const audio = useRef<NativeCoachAudio>(null);
  const cues = useRef(new CueTracker());
  const periodicSave=useRef(false);
  const audioSettings = useRef({voice,volume,countdown});
  audioSettings.current = {voice,volume,countdown};
  const settingsRef=useRef({hall,clean,muted,voice,volume,countdown});
  settingsRef.current={hall,clean,muted,voice,volume,countdown};
  const studioRef=useRef(studioId);studioRef.current=studioId;
  const settingsKey=`coach-settings:${base}:studio:${studioId}`;
  const discovery = useHubDiscovery({ready, base, load, save, onFound: (url) => {
    setBase(url); setDraftBase(url); setCode(null);
  }});
  const phoneSettings=useRef(null);
  const applySettings=(value)=>{
    const next=normalizeSettings(value);
    settingsRef.current=next;audioSettings.current=next;mutedRef.current=next.muted;
    setHall(next.hall);setClean(next.clean);setMuted(next.muted);setVoice(next.voice);setVolume(next.volume);setCountdown(next.countdown);
  };
  const syncRemoteState=(v:any)=>connection.current?.send({type:'state',state:{...v,studioId:studioRef.current,studioSettings:{...settingsRef.current}}});
  useEffect(() => {
    const sound = new NativeCoachAudio(setError);
    audio.current = sound;
    return () => sound.dispose();
  }, []);
  const syncSound = (v) => {
    const cue = cues.current.update(v,audioSettings.current);
    if (cue) void audio.current?.play(mutedRef.current ? {stop:true} : cue,audioSettings.current.volume);
  };
  useEffect(() => { audio.current?.stop(); }, [muted,voice,volume,countdown,mode,panel]);
  const size = Math.min(
    isTV ? height * 0.62 : width * 0.88,
    isTV ? width * 0.52 : 450,
  );
  const persist = () =>
    save("session", {
      ...engine.current.snapshot(),
      processed: processed.current,
    });
  const execute = async (type, payload?, remote = false) => {
    try {
      if (type !== "GET_STATUS") audio.current?.stop();
      if (type === "SET_VOLUME") {
        const n = Number(payload);
        if (!Number.isFinite(n) || n < 0 || n > 1)
          throw Error("עוצמה לא תקינה");
        audioSettings.current.volume = n;
        setVolume(n);
        await save("volume", n);
      } else if(type==='SET_VOICE'&&typeof payload==='boolean'){
        setVoice(payload);audioSettings.current.voice=payload;await save('voice',payload);
      } else if(type==='SET_COUNTDOWN'&&(payload===0||payload===10)){
        setCountdown(payload);audioSettings.current.countdown=payload;await save('countdown-policy',payload);
      } else if(type==='SET_MUTE'&&typeof payload==='boolean'){
        setMuted(payload);mutedRef.current=payload;
      } else if(type==='SET_HALL'&&typeof payload==='boolean'){
        setHall(payload);await save('hall',payload);
      } else if(type==='SET_CLEAN'&&typeof payload==='boolean'){
        setClean(payload);await save('clean',payload);
      } else engine.current.command(type, payload);
      const key=SETTING_COMMANDS[type];
      if(key)settingsRef.current={...settingsRef.current,[key]:payload};
      setView(engine.current.view());
      syncSound(engine.current.view());
      if (!remote) await persist();
      syncRemoteState(engine.current.view());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  const execRef = useRef(execute);
  execRef.current = execute;
  useEffect(() => {
    let disposed = false;
    (async () => {
      const [saved, hub, library, volume, savedHall, savedVoice, savedCountdown,savedClean,savedStudio] = await Promise.all([
        load("session"),
        load("hub", ""),
        load("programs", PRESETS),
        load("volume", 0.8),
        load("hall",true), load("voice",true), load("countdown-policy",10),load('clean',false),
        load('studio-id','1'),
      ]);
      if (disposed) return;
      if (saved)
        try {
          engine.current.restore(saved);
          processed.current = saved.processed || [];
        } catch {
          setError("השמירה לא תקינה. הטיימר אופס.");
        }
      setVolume(volume); setHall(savedHall); setVoice(savedVoice); setCountdown(savedCountdown);setClean(savedClean);
      const selectedStudio = ['1','2'].includes(savedStudio) ? savedStudio : '1';
      setStudioId(selectedStudio);
      // Android TV hosts the LAN hub itself. The phone connects to this URL
      // directly, so the installation does not require a computer or cloud service.
      let activeHub = hub;
      if (isTV && NativeModules.BareFitLocalHub?.start) {
        try {
          const local = await NativeModules.BareFitLocalHub.start(selectedStudio);
          activeHub = local.base;
          await save('hub', activeHub);
          await save('hub-identity', {id: local.hubId, base: activeHub});
        } catch (e) {
          setError('שרת הטלוויזיה המקומי לא הופעל. אפשר להזין כתובת ידנית בהגדרות.');
        }
      }
      setBase(activeHub);
      setDraftBase(activeHub);
      setPrograms(library);
      setView(engine.current.view());
      setReady(true);
    })();
    return () => {
      disposed = true;
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    let n = 0,
      revision = -1;
    const timer = setInterval(() => {
      const v = engine.current.view();
      setView(v);
      if (mode === "display") {
        if (++n % 3 === 0)
          syncRemoteState(v);
        if (n % 10 === 0 || v.revision !== revision) {
          revision = v.revision;
          if(!periodicSave.current){
            periodicSave.current=true;
            persist().catch(() => setError("לא ניתן לשמור את מצב האימון")).finally(()=>{periodicSave.current=false;});
          }
        }
        syncSound(v);
      }
    }, 100);
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") persist().catch(() => {});
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [ready, mode]);
  useEffect(() => {
    if (!ready || !base || mode !== "display") return;
    let cancelled = false,
      c,retry;
    const connect=async () => {
      try {
        const hostKey=`host:${base}:studio:${studioId}`;
        let credentials = await load(hostKey,studioId==='1'?await load('host:'+base):null);
        if (!credentials) {
          credentials = await request(base, "/api/rooms", {});
          await save(hostKey, credentials);
        }
        if (cancelled) return;
        c = new Connection(
          base,
          { ...credentials, role: "host", studioId },
          async (m) => {
            if(cancelled)return;
            if (m.type === "authenticated") {
              setDevices(m.devices || []);
              syncRemoteState(engine.current.view());
            }
            if (m.type === "pair-code") setCode(m);
            if (m.type === "pair-used") { setCode(null); setPanel(null); setError(`${m.name} התחבר למסך`); }
            if (m.type === "pair-request") {
              setCode(null);
              setPendingPair(m);
            }
            if (m.type === "devices") setDevices(m.devices);
            if (m.type === "command") {
              let ack = processed.current.find((a) => a.id === m.id);
              if (!ack) {
                const ok = await execRef.current(m.command, m.payload, true);
                ack = {
                  type: "ack",
                  id: m.id,
                  ok,
                  error: ok ? "" : "הפקודה לא בוצעה",
                };
                processed.current = [...processed.current, ack].slice(-500);
                try {
                  await persist();
                } catch {
                  ack.ok = false;
                  ack.error = "הפעולה בוצעה אך שמירת המצב נכשלה";
                }
              }
              c.send(ack);
            }
            if (m.type === "error") setError(m.error);
          },
          setStatus,
        );
        connection.current = c;
      } catch {
        if(!cancelled){
          setError("שירות הסטודיו לא זמין. הטיימר עובד מקומית.");
          retry=setTimeout(connect,5000);
        }
      }
    };
    void connect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      c?.close();
      connection.current = null;
    };
  }, [ready, base, mode,studioId]);
  useEffect(() => {
    if (!ready || !isTV || !NativeModules.BareFitLocalHub?.start) return;
    let active = true;
    NativeModules.BareFitLocalHub.start(studioId).then((local:any) => {
      if (!active || !local?.base || local.base === base) return;
      setBase(local.base); setDraftBase(local.base); save('hub', local.base).catch(() => {});
    }).catch(() => setError('לא ניתן להפעיל את שרת החיבור המקומי בטלוויזיה.'));
    return () => { active = false; };
  }, [ready, studioId, isTV]);
  useEffect(() => {
    if (mode !== "coach" || !base) return;
    if(skipCoachLoad.current===`${base}:${studioId}`){skipCoachLoad.current="";return;}
    let disposed = false;
    setCreds(null);setRemoteView(null);setHostOnline(false);
    Promise.all([load(`coach:${base}:studio:${studioId}`),load(settingsKey)]).then(([c,saved]) => {
      if (!disposed) {phoneSettings.current=saved;setCreds(c);if(saved)applySettings(saved);}
    });
    return () => {
      disposed = true;
    };
  }, [base, mode,studioId]);
  useEffect(()=>{
    if(!base||mode!=='coach')return;
    let disposed=false;
    const refresh=async()=>{try{const r=await fetch(base+'/api/studios');const data=await r.json();if(!disposed)setStudios(r.ok?data.studios||[]:[]);}catch{if(!disposed)setStudios([]);}};
    refresh();const timer=setInterval(refresh,5000);
    return()=>{disposed=true;clearInterval(timer);};
  },[base,mode]);
  useEffect(() => {
    if (!creds || mode !== "coach") return;
    const sync=new SettingsSync(()=>phoneSettings.current,(command,payload)=>{
      c.send({type:'command',id:commandId(),sequence:++sequence.current,command,payload});
    });
    const c = new Connection(
      base,
      { ...creds, role: creds.pending ? "pending" : "coach" },
      (m) => {
        if (m.type === "waiting") setWaiting(true);
        if (m.type === "paired") {
          const next = { room: creds.room, token: m.token };
          save(`coach:${base}:studio:${studioId}`, next).catch(()=>setError('שמירת החיבור נכשלה'));
          setCreds(next);
          setWaiting(false);
        }
        if (m.type === "authenticated") {
          setRole(m.role);
          sequence.current = m.sequence || 0;
        }
        if(m.type==='role-update'){setRole(m.role);sequence.current=m.sequence||0;setPendingCommand(null);setError(m.role==='controller'?'השליטה הועברה לטלפון הזה':'השליטה הועברה למכשיר אחר');}
        if (m.type === "state") {
          setRemoteView(m.state);
          if(m.state.studioSettings){
            if(!phoneSettings.current){phoneSettings.current=normalizeSettings(m.state.studioSettings);save(settingsKey,phoneSettings.current).catch(()=>setError('שמירת ההגדרות נכשלה'));}
            applySettings(m.state.studioSettings);
          }
        }
        if (m.type === "host-status") setHostOnline(m.online);
        if (m.type === "rejected") {
          setWaiting(false);
          setCreds(null);
          setError("בקשת החיבור נדחתה או פגה");
        }
        if (m.type === "ack") {
          setPendingCommand(current=>current===m.id?null:current);
          if (!m.ok) setError(m.error);
        }
        sync.update(m);
      },
      (value) => {
        setStatus(value);
        if(value!=='connected'){setHostOnline(false);sync.reset();}
        if (value === "unauthorized") {
          save(`coach:${base}:studio:${studioId}`, null).catch(()=>{});
          setCreds(null);
          setError("יש להתחבר מחדש למסך");
        }
      },
    );
    connection.current = c;
    return () => {
      c.close();
      connection.current = null;
    };
  }, [creds, mode, base,studioId]);
  useEffect(() => {
    if (!pendingCommand) return;
    const id = setTimeout(() => {
      setPendingCommand(null);
      setError("לא התקבל אישור. בדקו את המסך לפני ניסיון נוסף.");
    }, 6000);
    return () => clearTimeout(id);
  }, [pendingCommand]);
  const send = (type, payload?) => {
    if (mode === "display") return execute(type, payload);
    if (
      status !== "connected" ||
      !hostOnline ||
      role !== "controller" ||
      pendingCommand
    )
      return;
    const id = commandId();
    if (
      connection.current?.send({
        type: "command",
        id,
        sequence: ++sequence.current,
        command: type,
        payload,
      })
    ) {
      setPendingCommand(id);
      const key=SETTING_COMMANDS[type];
      if(key){phoneSettings.current={...normalizeSettings(phoneSettings.current||settingsRef.current),[key]:payload};save(settingsKey,phoneSettings.current).catch(()=>setError('שמירת ההגדרות בטלפון נכשלה'));}
    }
  };
  const shown = mode === "display" ? view : remoteView;
  const editable =
    mode === "display" ||
    (role === "controller" &&
      status === "connected" &&
      hostOnline &&
      !pendingCommand);
  const stop = () =>
    Alert.alert("לעצור את האימון?", "השעון יחזור להתחלה.", [
      { text: "ביטול", style: "cancel" },
      {
        text: "עצירת אימון",
        style: "destructive",
        onPress: () => send("STOP"),
      },
    ]);
  const remoteAction = useRef(null);
  remoteAction.current = (event) => {
    if (mode !== 'display' || !ready || !shown || panel || pendingPair) return;
    // Android sends key-down and key-up; act only once, on release.
    if (event.eventKeyAction != null && event.eventKeyAction !== 1) return;
    if (event.eventType === 'playPause') send(shown.status === 'running' ? 'PAUSE' : 'START');
    else if (event.eventType === 'play') send('START');
    else if (event.eventType === 'pause') send('PAUSE');
    else if (event.eventType === 'stop') stop();
  };
  useEffect(() => {
    if (!isTV) return;
    const subscription = TVEventHandler.addListener(event => remoteAction.current?.(event));
    return () => subscription?.remove();
  }, [isTV]);
  const connectPhone = async (target:{base:string;room:string;code:string;qrToken?:string;studioId?:string}={base,room,code:pairCode,studioId}) => {
    if(pairing.current)return;
    pairing.current=true;
    setPanel(null);setError('');setWaiting(true);
    try {
      const targetStudio=target.studioId||studioId;
      const saved=await load(`coach:${target.base}:studio:${targetStudio}`);
      const data=await request(target.base,'/api/pair',{room:target.room,code:target.code,qrToken:target.qrToken,existingToken:saved?.room===target.room?saved.token:undefined,name:Platform.OS==='ios'?'iPhone / iPad':'Android'});
      connection.current?.close();setRemoteView(null);setHostOnline(false);setRole('viewer');setPendingCommand(null);
      if(base!==target.base||mode!=='coach'||studioId!==targetStudio)skipCoachLoad.current=`${target.base}:${targetStudio}`;
      await save('hub',target.base);
      await save('studio-id',targetStudio);
      phoneSettings.current=await load(`coach-settings:${target.base}:studio:${targetStudio}`);
      if(phoneSettings.current)applySettings(phoneSettings.current);
      setStudioId(targetStudio);
      setBase(target.base);setDraftBase(target.base);setMode('coach');
      const next=data.paired ? {room:data.room,token:data.token} : {...data,pending:true};
      if(data.paired)await save(`coach:${target.base}:studio:${targetStudio}`,next);
      setCreds(next);setWaiting(!data.paired);
    }catch(e){setWaiting(false);setError(e.message);setPanel('pair');}
    finally{pairing.current=false;}
  };
  const connectStudio=async(id)=>{
    if(pairing.current)return;
    pairing.current=true;setWaiting(true);setError('');
    try {
      const previous=await load(`coach:${base}:studio:${id}`);
      const data=await request(base,'/api/connect-studio',{studioId:id,name:Platform.OS==='ios'?'iPhone / iPad':'Android',existingToken:previous?.token});
      connection.current?.close();setRemoteView(null);setHostOnline(false);setRole('viewer');setPendingCommand(null);
      if(studioId!==id)skipCoachLoad.current=`${base}:${id}`;
      phoneSettings.current=await load(`coach-settings:${base}:studio:${id}`);
      if(phoneSettings.current)applySettings(phoneSettings.current);
      await save(`coach:${base}:studio:${id}`,{room:data.room,token:data.token});await save('studio-id',id);
      setStudioId(id);setCreds({room:data.room,token:data.token});setPanel(null);
    }catch(e){setError(e.message);}finally{pairing.current=false;setWaiting(false);}
  };
  const approve = (ok) => {
    connection.current?.send({
      type: ok ? "approve" : "reject",
      id: pendingPair.id,
    });
    setPendingPair(null);
  };
  if (!ready || !fonts)
    return (
      <View style={[s.root, s.loading]}>
        <Image
          source={require("../public/assets/barefit-official-logo.webp")}
          resizeMode="contain"
          style={s.loadingLogo}
          accessibilityLabel="Barefit"
        />
        <Text style={s.loadingText}>טוען את הסטודיו…</Text>
      </View>
    );
  return (
    <ImageBackground
      source={clean?undefined:require("../public/assets/barefit-gym-quiet-logo.png")}
      resizeMode="cover"
      style={s.root}
    >
      <View style={[s.shade, clean&&{backgroundColor:'#030503'},hall && {backgroundColor:"#030503ed"}]} />
      <View style={[s.header, { paddingHorizontal: isTV ? 40 : 20 }]}>
        <Image
          source={require("../public/assets/barefit-official-logo.webp")}
          resizeMode="contain"
          style={{width:isTV ? 250 : 180, height:isTV ? 78 : 56}}
          accessibilityLabel="Barefit"
        />
        <View style={s.row}>
          <Action onPress={() => setPanel("settings")}>הגדרות</Action>
          {isTV && <Action onPress={() => setPanel("library")}>אימונים</Action>}
          {isTV && (
            <Action onPress={() => send("PREVIOUS_PHASE")}>שלב קודם</Action>
          )}
          {!isTV && (
            <Action
              onPress={() => {
                setMode(mode === "display" ? "coach" : "display");
                setRemoteView(null);
              }}
            >
              {" "}
              {mode === "display" ? "שליטה במסך" : "אימון במכשיר"}
            </Action>
          )}
          <Action
            onPress={() => {
              setPanel("pair");
              connection.current?.send({ type: "new-code" });
            }}
          >
            {mode === "display" ? "חיבור מאמן" : "חיבור למסך"}
          </Action>
        </View>
      </View>
      {!isTV && <View style={[s.row,{paddingHorizontal:16}]}>
        <Action primary onPress={()=>{setWorkout({...PRESETS[0],id:commandId(),name:'האימון שלי',kind:'CUSTOM'});setPanel('edit');}}>בניית אימון</Action>
        <Action camera onPress={()=>setPanel('scan')} disabled={waiting}>סריקת QR</Action>
        <Action onPress={()=>setPanel('library')}>האימונים שלי</Action>
      </View>}
      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingBottom: 20,
        }}
      >
        {shown ? (
          <>
            <Text style={s.workoutTitle}>{shown.workout.name}</Text>
            {hall ? <HallFace view={shown} width={width} height={height} /> : <Face view={shown} size={size} />}
            <View style={[s.row, { marginTop: 14 }]}>
              <Action disabled={!editable} onPress={() => send("NEXT_PHASE")}>
                דלג קדימה
              </Action>
              <Action
                primary
                preferredFocus={!panel && !pendingPair}
                disabled={!editable}
                onPress={() =>
                  send(shown.status === "running" ? "PAUSE" : "START")
                }
              >
                {shown.status === "running"
                  ? "השהיה"
                  : shown.status === "paused"
                    ? "המשך"
                    : "התחל אימון"}
              </Action>
              <Action
                disabled={!editable || shown.status === "ready"}
                onPress={stop}
              >
                עצור
              </Action>
            </View>
            {!isTV && (
              <View style={[s.row, { marginTop: 12 }]}>
                <Action
                  disabled={!editable}
                  onPress={() => send("PREVIOUS_PHASE")}
                >
                  שלב קודם
                </Action>
                <Action
                  disabled={!editable}
                  onPress={() => setPanel("library")}
                >
                  ספריית אימונים
                </Action>
                <Action disabled={!editable} onPress={() => send('SET_MUTE',!muted)}>
                  {muted ? "צליל כבוי" : "צליל פעיל"}
                </Action>
                {mode==='coach'&&role==='controller'&&<Action onPress={()=>setPanel('settings')}>הגדרות מסך</Action>}
              </View>
            )}
            <Text style={s.caption}>
              {mode === "display"
                ? "השעון פועל מקומית"
                : pendingCommand
                  ? "ממתין לאישור מהמסך"
                  : hostOnline
                    ? "מסונכרן עם המסך"
                    : "המסך אינו מחובר"}
            </Text>
          </>
        ) : (
          <View style={s.welcome}>
            <Text style={s.title}>
              {waiting ? "ממתינים לאישור בטלוויזיה" : "הסטודיו בידיים שלכם"}
            </Text>
            <Text style={s.text}>
              חברו את הטלפון למסך האימון דרך הרשת המקומית.
            </Text>
            <Action primary onPress={() => setPanel("pair")}>
              חיבור למסך
            </Action>
          </View>
        )}
      </ScrollView>
      <Text accessibilityLabel="נוצר על ידי Tomer AI Studio" style={{fontFamily:'Heebo',fontSize:isTV?14:12,color:'#c4cbbb',textAlign:'center',paddingVertical:8,marginBottom:isTV?4:20}}>נוצר על ידי <Text style={{fontWeight:'700',writingDirection:'ltr'}}>Tomer AI Studio</Text></Text>
      {!!error && (
        <Pressable onPress={() => setError("")} style={s.toast}>
          <Text style={s.text}>{error} ×</Text>
        </Pressable>
      )}
      <Modal
        visible={!!panel || !!pendingPair}
        transparent
        onRequestClose={() => (pendingPair ? approve(false) : setPanel(null))}
      >
        <View style={s.scrim}>
          <View
            style={[
              s.panel,
              {
                width: isTV ? 600 : Math.min(width - 32, 600),
                maxHeight: height * 0.9,
              },
            ]}
          >
            <ScrollView>
              <View style={[s.row, { justifyContent: "space-between" }]}>
                <Text style={s.title}>
                  {pendingPair
                    ? "בקשת חיבור חדשה"
                    : panel === "library"
                      ? "ספריית אימונים"
                      : panel === "settings"
                        ? "הגדרות הסטודיו"
                        : panel === "edit"
                          ? "תוכנית אימון"
                          : "חיבור מקומי"}
                </Text>
                <Action
                  preferredFocus
                  onPress={() =>
                    pendingPair ? approve(false) : setPanel(null)
                  }
                >
                  ×
                </Action>
              </View>
              {pendingPair ? (
                <>
                  <Text style={s.text}>
                    {pendingPair.name} מבקש להתחבר למסך.
                  </Text>
                  <View style={s.row}>
                    <Action onPress={() => approve(false)}>דחייה</Action>
                    <Action primary onPress={() => approve(true)}>
                      אישור
                    </Action>
                  </View>
                </>
              ) : panel === "settings" ? (
                <>
                  {mode==='display'&&<View style={s.row}>{['1','2'].map(id=><Action key={id} primary={studioId===id} disabled={view?.status==='running'} onPress={()=>{setStudioId(id);save('studio-id',id).catch(()=>setError('שמירת הסטודיו נכשלה'));}}>סטודיו {id}</Action>)}</View>}
                  <Text style={s.caption}>סטודיו {studioId}</Text>
                  {isTV && <Text style={s.caption}>שלט: חיצים לניווט · OK לבחירה · חזרה לסגירת חלון. השלט פועל גם ללא טלפון מחובר.</Text>}
                  <View style={[s.row,{flexWrap:'wrap',marginVertical:12}]}>
                    <Action onPress={() => mode==='coach'?send('SET_HALL',!hall):execute('SET_HALL',!hall)}>{hall?'מצב אולם פעיל':'הפעלת מצב אולם'}</Action>
                    <Action onPress={() => mode==='coach'?send('SET_CLEAN',!clean):execute('SET_CLEAN',!clean)}>{clean?'הצגת צילום רקע':'הסרת צילום הרקע'}</Action>
                    <Action onPress={() => mode==='coach'?send('SET_VOICE',!voice):execute('SET_VOICE',!voice)}>{voice?'קריינות בעברית פעילה':'הפעלת קריינות'}</Action>
                    <Action onPress={() => mode==='coach'?send('SET_MUTE',!muted):execute('SET_MUTE',!muted)}>{muted?'הפעלת צליל':'השתקת צליל'}</Action>
                    <Action onPress={() => mode==='coach'?send('SET_COUNTDOWN',countdown===0?10:0):execute('SET_COUNTDOWN',countdown===0?10:0)}>{countdown===0?'ספירה כבויה':'ספירה: 3 ברגיל · 10 באחרון'}</Action>
                    <Action onPress={() => mode==='coach'?send('SET_VOLUME',Math.max(0,Math.round((volume-.1)*10)/10)):execute('SET_VOLUME',Math.max(0,Math.round((volume-.1)*10)/10))}>− קול</Action>
                    <Text style={s.text}>{Math.round(volume*100)}%</Text>
                    <Action onPress={() => mode==='coach'?send('SET_VOLUME',Math.min(1,Math.round((volume+.1)*10)/10)):execute('SET_VOLUME',Math.min(1,Math.round((volume+.1)*10)/10))}>+ קול</Action>
                    <Action disabled={view?.status==='running'||volume===0} onPress={() => {audio.current?.preview(volume,voice);}}>בדיקת קול וספירה</Action>
                    <Action onPress={() => audio.current?.stop()}>עצירת בדיקה</Action>
                  </View>
                  <Text style={s.caption}>קול גברי מסונתז בעברית. הכרזות וצלילים שמורים במכשיר.</Text>
                  <Text style={s.text}>כתובת שירות הסטודיו</Text>
                  {discovery.supported && <>
                    <Text style={s.caption}>{discovery.message || 'כתובת השירות נבדקת אוטומטית כל 30 שניות. אם השתנתה, נחפש אותה מחדש.'}</Text>
                    <Action onPress={discovery.searchNow}>חיפוש שירות ברשת</Action>
                  </>}
                  <TextInput
                    style={s.input}
                    value={draftBase}
                    onChangeText={setDraftBase}
                    autoCapitalize="none"
                    placeholder="http://192.168.1.10:4174"
                    placeholderTextColor="#888"
                  />
                  <Action
                    primary
                    onPress={async () => {
                      try {
                        const u = new URL(draftBase);
                        if (!["http:", "https:"].includes(u.protocol))
                          throw Error();
                        await save("hub", u.origin);
                        setBase(u.origin);
                        setPanel(null);
                      } catch {
                        setError("כתובת שירות אינה תקינה");
                      }
                    }}
                  >
                    שמירת כתובת
                  </Action>
                  <Text style={s.caption}>
                    שירות הסטודיו מעביר פקודות בלבד. שעון האימון ממשיך לפעול גם
                    כשהחיבור מתנתק.
                  </Text>
                  {status === "unauthorized" && mode === "display" && (
                    <Action
                      onPress={async () => {
                        await AsyncStorage.removeItem(`host:${base}:studio:${studioId}`);
                        if(studioId==='1')await AsyncStorage.removeItem('host:'+base);
                        const old = base;
                        setBase("");
                        setTimeout(() => setBase(old), 100);
                      }}
                    >
                      איפוס חיבור המסך
                    </Action>
                  )}
                </>
              ) : panel === 'scan' && !isTV ? (
                <PhoneScanner onScan={connectPhone}/>
              ) : panel === "pair" ? (
                mode === "display" ? (
                  <>
                    <Text style={s.text}>
                      סרקו במצלמה הרגילה בטלפון ולחצו על הקישור. האתר יתחבר אוטומטית. יש להיות באותה רשת Wi-Fi.
                    </Text>
                    {code && code.expires > Date.now() ? (
                      <View style={{ alignItems: "center", padding: 20 }}>
                        <QRCode
                          value={pairLink(base,code,studioId)}
                          size={220}
                        />
                        <Text style={s.text}>מזהה מסך: {code.room}</Text>
                        <Text style={s.text}>קוד: {code.code}</Text>
                      </View>
                    ) : (
                      <Text style={s.text}>
                        אין קוד פעיל. ודאו שכתובת השירות הוגדרה.
                      </Text>
                    )}
                    <Action
                      onPress={() =>
                        connection.current?.send({ type: "new-code" })
                      }
                    >
                      קוד חדש
                    </Action>
                    {devices.map((d) => (
                      <View key={d.id} style={s.row}>
                        <Text style={s.text}>
                          {d.name} ·{" "}
                          {d.role === "controller" ? "שליטה" : "צפייה"}
                        </Text>
                        <Action
                          onPress={() =>
                            connection.current?.send({
                              type: "revoke",
                              id: d.id,
                            })
                          }
                        >
                          ביטול הרשאה
                        </Action>
                      </View>
                    ))}
                  </>
                ) : (
                  <>
                    <Text style={s.text}>
                      כתובת השירות: {base || "טרם הוגדרה"}
                    </Text>
                    {!base&&<Action onPress={()=>setPanel('settings')}>הגדרת כתובת השירות</Action>}
                    <Text style={s.title}>בחירת סטודיו</Text>
                    <View style={s.row}>{['1','2'].map(id=><Action key={id} primary disabled={waiting||!studios.some(studio=>studio.id===id)} onPress={()=>connectStudio(id)}>סטודיו {id}{studios.some(studio=>studio.id===id)?' · זמין':' · לא מחובר'}</Action>)}</View>
                    <Text style={s.caption}>החיבור מעביר את השליטה למאמן הזה באותו סטודיו בלבד.</Text>
                    <TextInput
                      style={s.input}
                      value={room}
                      onChangeText={setRoom}
                      autoCapitalize="none"
                      placeholder="מזהה מסך"
                      placeholderTextColor="#999"
                    />
                    <TextInput
                      style={s.input}
                      value={pairCode}
                      onChangeText={setPairCode}
                      autoCapitalize="none"
                      placeholder="קוד חיבור"
                      placeholderTextColor="#999"
                    />
                    <Action
                      primary
                      onPress={()=>connectPhone()}
                    >
                      בקשת חיבור
                    </Action>
                  </>
                )
              ) : panel === "library" ? (
                <>
                  <Action
                    primary
                    onPress={() => {
                      setWorkout({
                        ...PRESETS[0],
                        id: commandId(),
                        name: "האימון שלי",
                      });
                      setPanel("edit");
                    }}
                  >
                    אימון חדש
                  </Action>
                  {programs.map((p) => (
                    <View key={p.id} style={s.program}>
                      <Text style={s.workoutTitle}>{p.name}</Text>
                      <Text style={s.text}>
                        {p.work} שניות · {p.rest} מנוחה · {p.rounds} סבבים
                      </Text>
                      <View style={s.row}>
                        <Action
                          primary
                          disabled={!editable || shown?.status === "running"}
                          onPress={() => {
                            send("LOAD_WORKOUT", p);
                            setPanel(null);
                          }}
                        >
                          בחירה
                        </Action>
                        <Action
                          onPress={() => {
                            setWorkout({ ...p, id: commandId() });
                            setPanel("edit");
                          }}
                        >
                          שכפול ועריכה
                        </Action>
                      </View>
                    </View>
                  ))}
                </>
              ) : panel === "edit" && workout ? (
                <>
                  <TextInput
                    style={s.input}
                    value={workout.name}
                    onChangeText={(name) => setWorkout({ ...workout, name })}
                  />
                  {[
                    ["work", "עבודה"],
                    ["rest", "מנוחה"],
                    ["rounds", "סבבים"],
                    ["sets", "סטים"],
                    ["between", "מנוחה בין סטים"],
                    ["prepare", "הכנה"],
                  ].map(([key, label]) => (
                    <View key={key}>
                      <Text style={s.text}>{label}</Text>
                      <TextInput
                        style={s.input}
                        keyboardType="number-pad"
                        value={String(workout[key])}
                        onChangeText={(v) =>
                          setWorkout({ ...workout, [key]: v })
                        }
                      />
                    </View>
                  ))}
                  <Action
                    primary
                    onPress={() => {
                      try {
                        const w = validateWorkout(workout);
                        const list = [...programs, w];
                        save("programs", list).catch(()=>setError("שמירת האימונים במכשיר נכשלה"));
                        setPrograms(list);
                        setPanel("library");
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    שמירת תוכנית
                  </Action>
                </>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#030503" },
  loading: { alignItems: "center", justifyContent: "center", padding: 24 },
  loadingLogo: { width: 260, height: 100, marginBottom: 18 },
  loadingText: { fontFamily: "Heebo", color: "#b7c1ab", fontSize: 16 },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0007" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 28,
    paddingBottom: 12,
    flexWrap: "wrap",
  },
  brand: { fontFamily: "Anton", color: "white" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  button: {
    borderWidth: 1,
    borderColor: "#727e61",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: "#11190de8",
    minWidth: 70,
    marginVertical: 4,
  },
  primary: { backgroundColor: lime, borderColor: lime },
  focus: { borderColor: "white", borderWidth: 3, transform: [{ scale: 1.04 }] },
  buttonText: {
    color: "white",
    fontFamily: "Heebo",
    fontWeight: "700",
    fontSize: 18,
    textAlign: "center",
  },
  title: {
    fontFamily: "Heebo",
    color: "white",
    fontSize: 24,
    fontWeight: "700",
    textAlign: "right",
    marginVertical: 14,
  },
  text: {
    fontFamily: "Heebo",
    color: "#d3dcc8",
    fontSize: 16,
    textAlign: "right",
    lineHeight: 26,
    marginVertical: 8,
  },
  caption: {
    fontFamily: "Heebo",
    color: "#bdc7ae",
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
  workoutTitle: {
    fontFamily: "Heebo",
    color: "white",
    fontSize: 21,
    fontWeight: "700",
    textAlign: "right",
    marginVertical: 12,
  },
  welcome: { padding: 25, maxWidth: 450 },
  scrim: {
    flex: 1,
    backgroundColor: "#000c",
    alignItems: "center",
    justifyContent: "center",
  },
  panel: {
    backgroundColor: "#151c0f",
    borderColor: "#53643d",
    borderWidth: 1,
    borderRadius: 18,
    padding: 25,
  },
  input: {
    borderWidth: 1,
    borderColor: "#53643d",
    backgroundColor: "#090e06",
    borderRadius: 8,
    color: "white",
    fontSize: 18,
    padding: 14,
    marginVertical: 10,
    textAlign: "right",
  },
  program: { borderTopWidth: 1, borderColor: "#354328", paddingVertical: 16 },
  toast: {
    position: "absolute",
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: "#493b1b",
    borderRadius: 8,
    padding: 12,
  },
});
