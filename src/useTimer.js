import { useEffect, useRef, useState } from "react";
import { WorkoutEngine } from "../shared/engine.mjs";
import { Connection, request } from "../shared/connection.mjs";
import { read, write } from "./storage";
import { CueTracker } from "../shared/cues.mjs";
import { CoachAudio } from "./coachAudio";
export function useTimer(base,studioId='1') {
  const sessionKey=studioId==='1'?'session':`session:studio:${studioId}`;
  const engine = useRef(null);
  if (!engine.current) {
    engine.current = new WorkoutEngine();
    const data = read(sessionKey, null);
    if (data)
      try {
        engine.current.restore(data);
      } catch {
        write("recovery-warning", true);
      }
  }
  const [view, setView] = useState(() => engine.current.view());
  const processed = useRef(null);
  if (!processed.current) processed.current = read(sessionKey, {})?.processed || [];
  const [connection, setConnection] = useState("disconnected");
  const [code, setCode] = useState(null);
  const [lastPaired, setLastPaired] = useState(null);
  const [pending, setPending] = useState([]);
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState("");
  const link = useRef(null);
  const [muted, setMuted] = useState(() => read("muted", false));
  const audio = useRef(null);
  const cues = useRef(new CueTracker());
  const [audioStatus, setAudioStatus] = useState("loading");
  const [voice, setVoice] = useState(() => read("coach-voice", true));
  const [countdown, setCountdown] = useState(() => read("countdown-policy", 10));
  const [volume, setVolume] = useState(() => read("volume", 0.8));
  const [hall,setHallState]=useState(()=>read('hall',true));
  const [clean,setCleanState]=useState(()=>read('clean',false));
  const settings = useRef({});
  settings.current = { muted, volume, voice, countdown,hall,clean };
  const fullSettings=()=>({...settings.current});
  const syncState=(v)=>link.current?.send({type:'state',state:{...v,studioId,studioSettings:fullSettings()}});
  const setStudioSetting=(key,value)=>{
    if(key==='volume'){if(!Number.isFinite(value)||value<0||value>1)return; settings.current.volume=value;setVolume(value);write('volume',value);}
    else if(key==='voice'){settings.current.voice=!!value;setVoice(!!value);write('coach-voice',!!value);}
    else if(key==='countdown'&&[0,10].includes(value)){settings.current.countdown=value;setCountdown(value);write('countdown-policy',value);}
    else if(key==='muted'){settings.current.muted=!!value;setMuted(!!value);write('muted',!!value);}
    else if(key==='hall'||key==='clean'){settings.current[key]=!!value;const setter=key==='hall'?setHallState:setCleanState;setter(!!value);write(key,!!value);window.dispatchEvent(new CustomEvent('barefit-setting',{detail:{key,value:!!value}}));}
    else return;
    audio.current?.stop();
  };
  useEffect(() => {
    const sound = new CoachAudio(setAudioStatus);
    audio.current = sound;
    sound.prepare();
    const unlock = () => sound.unlock();
    document.addEventListener("pointerdown", unlock);
    document.addEventListener("keydown", unlock);
    return () => {
      document.removeEventListener("pointerdown", unlock);
      document.removeEventListener("keydown", unlock);
      sound.dispose();
    };
  }, []);
  const unlock = () => audio.current?.unlock();
  const syncSound = (v) => {
    const config = settings.current;
    const cue = cues.current.update(v, config);
    if (cue) audio.current?.play(config.muted ? {stop:true} : cue, config.volume);
  };
  const persist = () => {
    const saved = write(sessionKey, {...engine.current.snapshot(), processed: processed.current});
    if (!saved)
      setError("לא ניתן לשמור במכשיר. האימון ממשיך, אך שחזור אינו זמין.");
    return saved;
  };
  const execute = (type, payload, deferPersist = false) => {
    unlock();
    if (type !== "GET_STATUS") audio.current?.stop();
    try {
      if (type === "SET_VOLUME") {
        const value = Number(payload);
        if (!Number.isFinite(value) || value < 0 || value > 1)
          throw Error("עוצמה לא תקינה");
        settings.current.volume = value;
        audio.current?.stop();
        setVolume(value);
        write("volume", value);
      } else if(type==='SET_VOICE'){
        if(typeof payload!=='boolean')throw Error('הגדרת קריינות לא תקינה');
        setStudioSetting('voice',payload);
      } else if(type==='SET_COUNTDOWN'){
        if(![0,10].includes(payload))throw Error('הגדרת ספירה לא תקינה');
        setStudioSetting('countdown',payload);
      } else if(type==='SET_MUTE'){
        if(typeof payload!=='boolean')throw Error('הגדרת צליל לא תקינה');
        setStudioSetting('muted',payload);
      } else if(type==='SET_HALL'||type==='SET_CLEAN'){
        if(typeof payload!=='boolean')throw Error('הגדרת תצוגה לא תקינה');
        setStudioSetting(type==='SET_HALL'?'hall':'clean',payload);
      } else engine.current.command(type, payload);
      if (!deferPersist) persist();
      const v = engine.current.view();
      setView(v);
      syncSound(v);
      syncState(v);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    }
  };
  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => {
    let count = 0;
    let lastRevision = -1;
    const timer = setInterval(() => {
      const v = engine.current.view();
      setView(v);
      count++;
      if (v.revision !== lastRevision || count % 10 === 0) {
        persist();
        lastRevision = v.revision;
      }
      if (count % 3 === 0) syncState(v);
      syncSound(v);
    }, 100);
    const hide = () => persist();
    window.addEventListener("pagehide", hide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", hide);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let conn;
    let retry;
    setCode(null);
    setPending([]);
    setDevices([]);
    const connect = async () => {
      try {
        const hostKey=`host:${base}:studio:${studioId}`;
        let credentials = read(hostKey,studioId==='1'?read("host:"+base,null):null);
        if (!credentials) {
          credentials = await request(base, "/api/rooms", {});
          write(hostKey, credentials);
        }
        if (cancelled) return;
        conn = new Connection(
          base,
          { ...credentials, role: "host",studioId },
          (m) => {
            if (cancelled) return;
            if (m.type === "authenticated") {
              setDevices(m.devices || []);
              syncState(engine.current.view());
            }
            if (m.type === "pair-code") setCode(m);
            if (m.type === "pair-used") {
              setCode(null);
              setLastPaired(m);
              setError(`${m.name} התחבר למסך`);
            }
            if (m.type === "pair-request") {
              setCode(null);
              setPending((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
            }
            if (m.type === "devices") setDevices(m.devices);
            if (m.type === "error") setError(m.error);
            if (m.type === "command") {
              const seen = processed.current;
              const previous = seen.find((x) => x.id === m.id);
              if (previous) {
                conn.send(previous);
                return;
              }
              const ok = executeRef.current(m.command, m.payload, true);
              const ack = {
                type: "ack",
                id: m.id,
                ok,
                error: ok ? "" : "לא ניתן לבצע את הפקודה במצב הנוכחי",
              };
              processed.current = [...seen, ack].slice(-500);
              if (!persist()) { ack.ok = false; ack.error = 'הפעולה בוצעה אך שמירת המצב נכשלה'; }
              conn.send(ack);
            }
          },
          (s)=>{if(cancelled)return;setConnection(s);if(s==='unauthorized')setError(`חיבור סטודיו ${studioId} אינו זמין. בדקו שאין מסך נוסף באותו סטודיו או אפסו את החיבור.`);},
        );
        link.current = conn;
      } catch (e) {
        if (!cancelled) {
          setConnection("disconnected");
          setError("הטיימר זמין. לחיבור טלפון יש להפעיל את שירות הסטודיו.");
          retry = setTimeout(connect, 5000);
        }
      }
    };
    connect();
    return () => {
      cancelled = true;
      clearTimeout(retry);
      conn?.close();
      link.current = null;
    };
  }, [base,studioId]);
  useEffect(() => {
    let lock;
    const acquire = () => {
      if (view.status === "running" && document.visibilityState === "visible")
        navigator.wakeLock
          ?.request("screen")
          .then((l) => (lock = l))
          .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      lock?.release();
      document.removeEventListener("visibilitychange", acquire);
    };
  }, [view.status]);
  return {
    view,
    hall,clean,
    setHall:(value)=>setStudioSetting('hall',value),setClean:(value)=>setStudioSetting('clean',value),
    setStudioSetting,
    execute,
    connection,
    code,
    lastPaired,
    pending,
    devices,
    error,
    setError,
    muted,
    toggleMute: () => {
      unlock();
      audio.current?.stop();
      settings.current.muted = !muted;
      setMuted((v) => {
        write("muted", !v);
        return !v;
      });
    },
    volume,
    voice, countdown, audioStatus,
    setVoice: (v) => { audio.current?.stop(); settings.current.voice = v; setVoice(v); write("coach-voice",v); },
    setCountdown: (v) => { audio.current?.stop(); settings.current.countdown = v; setCountdown(v); write("countdown-policy",v); },
    previewSound: () => {
      if (engine.current.view().status === 'running') return;
      if (settings.current.muted) { setMuted(false); settings.current.muted = false; write('muted',false); }
      audio.current?.preview(settings.current.volume, settings.current.voice);
    },
    stopSound: () => audio.current?.stop(),
    newCode: () => link.current?.send({ type: "new-code" }),
    approve: (id, approved) => {
      link.current?.send({ type: approved ? "approve" : "reject", id });
      setPending((p) => p.filter((x) => x.id !== id));
    },
    revoke: (id) => link.current?.send({ type: "revoke", id }),
    resetPairing: () => {
      write(`host:${base}:studio:${studioId}`, null);
      if(studioId==='1')write('host:'+base,null);
      location.reload();
    },
  };
}
