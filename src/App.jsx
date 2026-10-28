import React, { useState, useEffect, useRef } from "react";
import {
  Camera,
  Play,
  Pause,
  Square,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Smartphone,
  SlidersHorizontal,
  X,
  Plus,
  Check,
  ArrowLeft,
  Wifi,
  WifiOff,
  Download,
  Upload,
  RotateCcw,
  Monitor,
  BookOpen,
  Menu,
} from "lucide-react";
import QRCode from "qrcode";
import QrScanner from "./QrScanner";
import { parsePairQr, pairLink } from "../shared/pairing.mjs";
import {
  PRESETS,
  LABELS,
  formatTime,
  validateWorkout,
} from "../shared/engine.mjs";
import { Connection, request, commandId } from "../shared/connection.mjs";
import { useTimer } from "./useTimer";
import { roundNotice, countdownWindow } from "../shared/cues.mjs";
import { read, write } from "./storage";
import { DEFAULT_SETTINGS, normalizeSettings, SettingsSync } from '../shared/settings.mjs';
const palette = {
  ready: "#b4ff00",
  prepare: "#57b7ff",
  work: "#b4ff00",
  rest: "#ffb146",
  between: "#ffb146",
  finished: "#b4ff00",
};
const WORKOUT_MODES = [
  { id: "AMRAP", label: "כמה שיותר סבבים", shortLabel: "AMRAP", description: "עובדים ברצף עד שהזמן נגמר", color: "#f39b1a", defaults: { name: "כמה שיותר סבבים", work: 360, rest: 0, rounds: 1, sets: 1, between: 0, prepare: 10 } },
  { id: "FOR TIME", label: "סיום מהיר", shortLabel: "FOR TIME", description: "מסיימים את המשימה לפני הזמן", color: "#5d72ff", defaults: { name: "סיום מהיר", work: 600, rest: 0, rounds: 1, sets: 1, between: 0, prepare: 10 } },
  { id: "EMOM", label: "מתחילים מחדש כל פעם", shortLabel: "EMOM", description: "תרגיל חדש מתחיל במרווח קבוע", color: "#a900e8", defaults: { name: "מתחילים מחדש כל פעם", work: 60, rest: 0, rounds: 6, sets: 1, between: 0, prepare: 10 } },
  { id: "TABATA", label: "אימון טבטה", shortLabel: "TABATA", description: "עבודה קצרה ומנוחה קצרה", color: "#20c29a", defaults: { name: "אימון טבטה", work: 20, rest: 10, rounds: 8, sets: 1, between: 0, prepare: 10 } },
  { id: "MIX", label: "אימון מותאם אישית", shortLabel: "MIX", description: "אתם בוחרים עבודה, מנוחה וסבבים", color: "#555a5f", defaults: { name: "אימון מותאם אישית", work: 45, rest: 15, rounds: 8, sets: 3, between: 90, prepare: 10 } },
];
export default function App() {
  const [booting, setBooting] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 900);
    return () => window.clearTimeout(timer);
  }, []);
  if (booting) return <BootScreen />;
  const params = new URLSearchParams(location.search);
  return params.get("mode") === "coach" || (!params.has("mode") && window.matchMedia("(max-width: 740px)").matches) ||
    location.pathname.endsWith("/coach") ? (
    <Coach />
  ) : (
    <Display />
  );
}
function BootScreen() {
  return (
    <main className="boot-screen" role="status" aria-label="BareFit נטען">
      <div className="boot-glow" />
      <img className="boot-logo" src="./assets/barefit-official-logo.webp" alt="Barefit" />
      <div className="boot-loader" aria-hidden="true"><span /></div>
      <p>מכינים את האימון</p>
      <small>Tomer AI Studio</small>
    </main>
  );
}
function Brand({ small = false }) {
  return (
    <div className={"brand " + (small ? "small" : "")} dir="ltr">
      <img
        className="brand-logo"
        src="./assets/barefit-official-logo.webp"
        alt="Barefit"
      />
    </div>
  );
}
function Button({ icon: Icon, children, primary = false, ...props }) {
  return (
    <button className={"action " + (primary ? "primary" : "")} {...props}>
      {Icon && <Icon />}
      {children && <span>{children}</span>}
    </button>
  );
}
function Overlay({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector("button")?.focus();
    const handler = (e) => {
      if (["Escape", "BrowserBack", "GoBack"].includes(e.key)) {
        e.preventDefault();
        onClose();
      }
      if (e.key === "Tab") {
        const els = ref.current.querySelectorAll(
          "button:not(:disabled),input,select,a[href],textarea",
        );
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      prev?.focus();
    };
  }, []);
  return (
    <div
      className="scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={ref}
        className={"dialog " + (wide ? "wide" : "")}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="סגירה">
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
function SessionMenu({ finished = false, onClose, onBuilder, onLibrary, onRestart }) {
  return (
    <Overlay title={finished ? "האימון הסתיים" : "תפריט אימון"} onClose={onClose}>
      <div className="session-menu">
        {finished ? (
          <>
            <div className="session-complete-mark"><Check size={30} /></div>
            <h3>כל הכבוד</h3>
            <p>הסשן הסתיים. בחרו מה לעשות עכשיו.</p>
          </>
        ) : (
          <p>בחרו פעולה כדי להתחיל או להכין את האימון הבא.</p>
        )}
        <div className="session-menu-actions">
          {finished && <Button primary icon={RotateCcw} onClick={onRestart}>התחלה מחדש</Button>}
          <Button primary={!finished} icon={Plus} onClick={onBuilder}>בניית אימון</Button>
          <Button icon={BookOpen} onClick={onLibrary}>ספריית אימונים</Button>
        </div>
      </div>
    </Overlay>
  );
}
function TimerFace({ view, compact = false }) {
  const shown =
    view.status === "ready" ? view.workout.work * 1000 : view.remaining;
  const notice = roundNotice(view);
  const closing = view.status === "running" && shown <= countdownWindow(view) * 1000;
  return (
    <div
      className={"timer-face " + (compact ? "compact" : "") + (closing ? " closing" : "")}
      style={{ "--phase": palette[view.phase] || palette.work }}
    >
      <svg className="ring" viewBox="0 0 600 600" aria-hidden="true">
        <circle className="ring-outline" cx="300" cy="300" r="289" />
        <circle className="ring-track" cx="300" cy="300" r="271" />
        <circle
          className="ring-progress"
          cx="300"
          cy="300"
          r="271"
          pathLength="100"
          strokeDasharray={`${view.status === "ready" ? 100 : view.progress * 100} 100`}
        />
      </svg>
      <div className="timer-inner">
        <div className="phase-label">
          {view.status === "paused"
            ? "השהיה"
            : view.label || LABELS[view.phase]}
        </div>
        <div
          className={"clock" + (shown >= 6000000 ? " long-clock" : "")}
          dir="ltr"
          aria-label={`${LABELS[view.phase]} ${formatTime(shown)}`}
        >
          {view.status === "finished" ? "✓" : formatTime(shown)}
        </div>
        {notice && <div className="round-notice">{notice}</div>}
        <div className="round-badge">
          <span>{view.status === "finished" ? "הושלם" : "סבב"}</span>
          <strong dir="ltr">
            {view.status === "finished" ? view.workout.rounds : view.round}
            <i>/{view.workout.rounds}</i>
          </strong>
        </div>
        {view.workout.sets > 1 && (
          <div className="set-label">
            סט {view.set} מתוך {view.workout.sets}
          </div>
        )}
      </div>
      <div className="hall-progress" aria-hidden="true"><div style={{width: `${view.status === 'ready' ? 100 : view.progress * 100}%`}} /></div>
    </div>
  );
}
function Controls({ view, execute, stop }) {
  return (
    <div className="controls" dir="ltr">
      <Button icon={SkipForward} onClick={() => execute("NEXT_PHASE")}>
        דלג קדימה
      </Button>
      <Button
        primary
        icon={view.status === "running" ? Pause : Play}
        onClick={() => execute(view.status === "running" ? "PAUSE" : "START")}
      >
        {view.status === "running"
          ? "השהיה"
          : view.status === "paused"
            ? "המשך"
            : view.status === "finished"
              ? "אימון נוסף"
              : "התחל אימון"}
      </Button>
      <Button icon={Square} onClick={stop} disabled={view.status === "ready"}>
        עצור
      </Button>
    </div>
  );
}
function useBase() {
  return useState(() =>
    read("hub", location.protocol.startsWith("http") ? location.origin : ""),
  );
}
function Display() {
  const [base, setBase] = useBase();
  const [studioId,setStudioId]=useState(()=>{
    const requested=new URLSearchParams(location.search).get('studio');
    return ['1','2'].includes(requested)?requested:read('studio-id','1');
  });
  const t = useTimer(base,studioId);
  const [panel, setPanel] = useState("library"),
    [fullscreen, setFullscreen] = useState(false),
    [clean, setClean] = [t.clean,t.setClean],
    [hall, setHall] = [t.hall,t.setHall],
    [qr, setQr] = useState("");
  const [now, setNow] = useState(Date.now());
  const lastStatus = useRef(t.view.status);
  useEffect(() => { if (t.lastPaired) setPanel(null); }, [t.lastPaired]);
  useEffect(()=>{const onSetting=e=>{if(e.detail.key==='hall')setHall(e.detail.value);if(e.detail.key==='clean')setClean(e.detail.value);};window.addEventListener('barefit-setting',onSetting);return()=>window.removeEventListener('barefit-setting',onSetting);},[]);
  const [pairOrigin,setPairOrigin] = useState(base);
  useEffect(()=>{
    let cancelled=false;
    setPairOrigin(base);
    try {
      if (!['localhost','127.0.0.1','[::1]'].includes(new URL(base).hostname)) return;
      fetch(base+'/api/network').then(r=>r.json()).then(data=>{
        if(!cancelled && data.urls?.length) setPairOrigin(data.urls[0]);
      }).catch(()=>{});
    }catch{}
    return ()=>{cancelled=true;};
  },[base]);
  const [programs, setPrograms] = useState(() => read("programs", PRESETS));
  const [stateTip, setStateTip] = useState(
    read("session", null)?.status === "running"
      ? "האימון שוחזר בהשהיה. אפשר להמשיך כשמוכנים."
      : "",
  );
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (t.view.status === "finished" && lastStatus.current !== "finished") setPanel("session-menu");
    lastStatus.current = t.view.status;
  }, [t.view.status]);
  const pairUrl = t.code
    ? pairLink(pairOrigin,t.code,studioId)
    : "";
  useEffect(() => {
    if (pairUrl)
      QRCode.toDataURL(pairUrl, {
        margin: 4,
        width: 320,
        color: { dark: "#0d1207", light: "#ffffff" },
      }).then(setQr);
  }, [pairUrl]);
  useEffect(() => {
    const handle = (e) => {
      const modal = document.querySelector("[role=dialog]");
      const field = ["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName);
      // Left/right edit field values; up/down move to the next setting.
      if (field && !["ArrowDown", "ArrowUp"].includes(e.key)) {
        if (e.key === "Enter" && e.target.type === "checkbox") {
          e.preventDefault();
          if (!e.repeat) e.target.click();
        }
        return;
      }
      if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) {
        const elements = Array.from(
          (modal || document).querySelectorAll("button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary"),
        ).filter((el) => el.getClientRects().length && !el.closest('[inert]'));
        const current = elements.indexOf(document.activeElement);
        const delta = ["ArrowRight", "ArrowDown"].includes(e.key) ? 1 : -1;
        elements[
          current < 0 ? 0 : (current + delta + elements.length) % elements.length
        ]?.focus();
        e.preventDefault();
      } else if (e.key === "Enter" && !modal && !document.activeElement?.matches("button,a,summary")) {
        e.preventDefault();
        document.querySelector(".controls .primary")?.focus();
      } else if (!modal && [" ", "MediaPlayPause"].includes(e.key)) {
        e.preventDefault();
        if (!e.repeat) t.execute(t.view.status === "running" ? "PAUSE" : "START");
      } else if (!modal && e.key === "MediaStop") {
        e.preventDefault();
        if (!e.repeat) setPanel("stop");
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [t.view.status]);
  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  const full = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      t.setError("מסך מלא אינו זמין בדפדפן זה");
    }
  };
  const savePrograms = (p) => {
    setPrograms(p);
    if (!write("programs", p)) t.setError("שמירת התוכניות נכשלה");
  };
  return (
    <main
      className={"display " + (clean ? "clean " : "") + (hall ? "hall" : "")}
      style={{ "--phase": palette[t.view.phase] || palette.work }}
    >
      <div className="photo" />
      <div className="photo-shade" />
      <header className="topbar">
        <div className="brand-block">
          <Brand />
          <p dir="ltr">
            STRONGER PEOPLE
            <br />
            HAPPIER LIVES
            <span />
          </p>
        </div>
        <nav>
          <button onClick={() => setPanel("menu")}>
            <Menu size={18} /> תפריט
          </button>
          <button onClick={() => setPanel("builder")}>
            <Plus size={18} /> בניית אימון
          </button>
          <button onClick={() => setPanel("library")}>
            <BookOpen size={18} /> ספריית אימונים
          </button>
          <button
            onClick={() => {
              setPanel("pair");
              t.newCode();
            }}
          >
            <Smartphone size={18} /> חיבור מאמן{" "}
            <span
              className={
                "status-dot " + (t.connection === "connected" ? "online" : "")
              }
            />
          </button>
          <button
            className="icon-button"
            onClick={() => setPanel("settings")}
            aria-label="הגדרות"
          >
            <SlidersHorizontal size={19} />
          </button>
        </nav>
      </header>
      <section className="timer-stage" aria-label="שעון אימון">
        <TimerFace view={t.view} />
        <Controls
          view={t.view}
          execute={t.execute}
          stop={() => setPanel("stop")}
        />
        <div className="under-controls">
          {t.view.status === "ready"
            ? "קחו נשימה. מתחילים כשאתם מוכנים."
            : t.view.status === "paused"
              ? "הזמן עוצר. הכוח נשאר."
              : t.view.status === "finished"
                ? "נתתם הכול. נתראה באימון הבא."
                : `עוד ${formatTime(t.view.totalRemaining)} עד לסיום האימון`}
        </div>
      </section>
      <footer className="display-footer">
        <div className="creator-credit" dir="rtl">נוצר על ידי <bdi>Tomer AI Studio</bdi></div>
        <div className="footer-actions">
          <button className="hall-toggle" aria-pressed={hall} onClick={() => setHall(!hall)}>
            <Monitor size={18} /> {hall ? 'תצוגת עיצוב' : 'מצב אולם'}
          </button>
          <button
            className="icon-button"
            onClick={t.toggleMute}
            aria-label={t.muted ? "הפעלת צליל" : "השתקת צליל"}
          >
            {t.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button className="icon-button" onClick={full} aria-label="מסך מלא">
            {fullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
          </button>
        </div>
      </footer>
      {(t.error || stateTip) && (
        <div className="toast" role="status">
          <span>{t.error || stateTip}</span>
          <button
            onClick={() => {
              t.setError("");
              setStateTip("");
            }}
            aria-label="סגירת הודעה"
          >
            <X size={17} />
          </button>
        </div>
      )}
      {panel === "stop" && (
        <Overlay title="לעצור את האימון?" onClose={() => setPanel(null)}>
          <p>השעון יחזור להתחלה. התוכנית השמורה תישאר בספרייה.</p>
          <div className="dialog-actions">
            <Button onClick={() => setPanel(null)}>חזרה לאימון</Button>
            <Button
              primary
              icon={Square}
              onClick={() => {
                t.execute("STOP");
                setPanel(null);
              }}
            >
              עצירת אימון
            </Button>
          </div>
        </Overlay>
      )}
      {panel === "library" && (
        <Library
          programs={programs}
          setPrograms={savePrograms}
          active={t.view.workout}
          onClose={() => setPanel(null)}
          onLoad={(p) => {
            if (t.execute("LOAD_WORKOUT", p)) setPanel(null);
          }}
        />
      )}
      {panel === "builder" && (
        <WorkoutBuilder
          onCancel={() => setPanel(null)}
          onSave={(workout) => {
            savePrograms([...programs.filter((item) => item.id !== workout.id), workout]);
            if (t.execute("LOAD_WORKOUT", workout)) setPanel(null);
            else setPanel("library");
          }}
        />
      )}
      {panel === "menu" && (
        <SessionMenu
          onClose={() => setPanel(null)}
          onBuilder={() => setPanel("builder")}
          onLibrary={() => setPanel("library")}
          onRestart={() => { t.execute("START"); setPanel(null); }}
        />
      )}
      {panel === "session-menu" && (
        <SessionMenu
          finished
          onClose={() => setPanel(null)}
          onBuilder={() => setPanel("builder")}
          onLibrary={() => setPanel("library")}
          onRestart={() => { t.execute("START"); setPanel(null); }}
        />
      )}
      {panel === "pair" && (
        <Overlay title="הסטודיו בידיים שלכם" onClose={() => setPanel(null)}>
          <p>
            פתחו את המצלמה הרגילה בטלפון, כוונו לקוד ולחצו על הקישור שמופיע. האתר יתחבר אוטומטית — בלי צילום ובלי הקלדת קוד.
          </p>
          <p className="muted">הטלפון והמסך צריכים להיות באותה רשת. הקוד אישי, חד־פעמי ותקף לשתי דקות. אם כבר מחובר מאמן, הטלפון הנוסף יתחבר לצפייה.</p>
          {t.connection === "connected" ? (
            <>
              <div className="qr-block">
                {qr && t.code?.expires > now ? (
                  <img src={qr} alt="קוד QR לחיבור המאמן" />
                ) : (
                  <div className="qr-placeholder">
                    <Smartphone size={48} />
                    <p>קוד החיבור אינו פעיל</p>
                  </div>
                )}
              </div>
              <div className="pair-countdown">
                {t.code?.expires > now
                  ? `הקוד תקף לעוד ${Math.ceil((t.code.expires - now) / 1000)} שניות`
                  : "הפיקו קוד חדש לחיבור"}
              </div>
              <Button icon={RotateCcw} onClick={t.newCode}>
                קוד חדש
              </Button>
              <details>
                <summary>פתיחה ידנית בטלפון</summary>
                <a
                  className="pair-link"
                  href={pairUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {pairUrl}
                </a>
                {pairOrigin.includes("localhost") && (
                  <p className="warning">
                    כתובת localhost זמינה במחשב הזה בלבד. בהגדרות בחרו את כתובת
                    הרשת של שירות הסטודיו.
                  </p>
                )}
              </details>
            </>
          ) : (
            <>
              <p className="warning">
                שירות החיבור אינו מחובר. הטיימר ממשיך לעבוד מקומית.
              </p>
              <Button onClick={() => setPanel("settings")}>
                הגדרת כתובת השירות
              </Button>
            </>
          )}
          {t.devices.length > 0 && (
            <div className="devices">
              <h3>מכשירים מורשים</h3>
              {t.devices.map((d) => (
                <div key={d.id}>
                  <span>
                    {d.name} · {d.role === "controller" ? "שליטה" : "צפייה"}
                  </span>
                  <button onClick={() => t.revoke(d.id)}>ביטול הרשאה</button>
                </div>
              ))}
            </div>
          )}
        </Overlay>
      )}
      {panel === "settings" && (
        <Overlay title="הגדרות הסטודיו" onClose={() => setPanel(null)}>
          <Settings
            base={base}
            studioId={studioId}
            setStudioId={setStudioId}
            setBase={(b) => {
              write("hub", b);
              setBase(b);
            }}
            hall={hall}
            setHall={setHall}
            clean={clean}
            setClean={(v) => {
              setClean(v);
            }}
            t={t}
          />
        </Overlay>
      )}
      {t.pending.length > 0 && (
        <Overlay
          title="בקשת חיבור חדשה"
          onClose={() => t.approve(t.pending[0].id, false)}
        >
          <p>
            <strong>{t.pending[0].name}</strong> מבקש להתחבר למסך. אשרו רק מכשיר
            שאתם מזהים.
          </p>
          <div className="dialog-actions">
            <Button onClick={() => t.approve(t.pending[0].id, false)}>
              דחייה
            </Button>
            <Button
              primary
              icon={Check}
              onClick={() => t.approve(t.pending[0].id, true)}
            >
              אישור חיבור
            </Button>
          </div>
        </Overlay>
      )}
    </main>
  );
}
function Settings({ base, setBase, studioId, setStudioId, clean, setClean, hall, setHall, t }) {
  useEffect(() => () => t.stopSound(), []);
  const [url, setUrl] = useState(base);
  const [err, setErr] = useState("");
  return (
    <div className="settings">
      <label className="field">מספר הסטודיו במסך
        <select value={studioId} onChange={e=>{
          const next=e.target.value;
          write('studio-id',next);
          const url=new URL(location.href);url.searchParams.set('studio',next);
          location.replace(url.href);
          setStudioId(next);
        }}>
          <option value="1">סטודיו 1</option><option value="2">סטודיו 2</option>
        </select>
      </label>
      <p className="muted">בחרו מספר שונה בכל אחד משני מסכי האימון. הטלפון יוכל לבחור לאיזה מסך להתחבר.</p>
      <label className="toggle-row"><span>מצב אולם · ספרות ענק וניגודיות גבוהה</span><input type="checkbox" checked={hall} onChange={e=>setHall(e.target.checked)} /></label>
      <label className="toggle-row">
        <span>תצוגה נקייה ללא צילום רקע</span>
        <input
          type="checkbox"
          checked={clean}
          onChange={(e) => setClean(e.target.checked)}
        />
      </label>
      <label className="field">
        עוצמת קול וצלילים
        <input
          type="range"
          min="0"
          max="1"
          step=".1"
          value={t.volume}
          onChange={(e) => t.execute("SET_VOLUME", Number(e.target.value))}
        />
      </label>
      <label className="toggle-row"><span>קריינות מאמן בעברית</span><input type="checkbox" checked={t.voice} onChange={e=>t.setVoice(e.target.checked)} /></label>
      <label className="field">ספירה מותאמת לאימון
        <select value={t.countdown} onChange={e=>t.setCountdown(Number(e.target.value))}>
          <option value={10}>3 ברגיל · 10 בסיבוב האחרון</option><option value={0}>ללא ספירה</option>
        </select>
      </label>
      <div className="sound-preview">
        <Button icon={Volume2} onClick={t.previewSound} disabled={t.view.status === 'running' || t.volume === 0 || t.audioStatus === 'loading'}>בדיקת קול וספירה</Button>
        <Button onClick={t.stopSound}>עצירת בדיקה</Button>
      </div>
      <p className="muted">סיבוב רגיל ומנוחה: 3 שניות. הסיבוב האחרון באימון: 10 שניות. תרגול רציף או AMRAP: 3 שניות, ללא הכרזת סיבוב אחרון. תחילת מנוחה מסומנת בצליל.</p>
      {t.audioStatus === 'error' && <p className="warning" role="alert">טעינת השמע נכשלה. רעננו את המסך ובדקו שוב לפני האימון.</p>}
      {t.audioStatus === 'blocked' && <p className="warning" role="status">לחצו על בדיקת קול להפעלת השמע במכשיר זה.</p>}
      <label className="field">
        כתובת שירות הסטודיו
        <input
          dir="ltr"
          value={url}
          placeholder="http://192.168.1.10:4174"
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <p className="muted">
        הכתובת מופיעה במחשב שמפעיל את שירות BareFit. הטלוויזיה והטלפון צריכים
        להיות באותה רשת.
      </p>
      {err && <p className="warning">{err}</p>}
      <Button
        onClick={() => {
          try {
            const u = new URL(url);
            if (!["http:", "https:"].includes(u.protocol)) throw Error();
            setBase(u.origin);
            setErr("");
          } catch {
            setErr("יש להזין כתובת http או https תקינה");
          }
        }}
      >
        שמירת כתובת
      </Button>
      {t.connection === "unauthorized" && (
        <Button onClick={t.resetPairing}>יצירת חיבור מסך חדש</Button>
      )}
      <p className="muted">
        שלט: חיצים לניווט · OK לבחירה · חזרה לסגירת חלון. בשדות הגדרות: ימין ושמאל לשינוי, למעלה ולמטה למעבר. השליטה במסך פועלת גם ללא טלפון מחובר.
      </p>
    </div>
  );
}
function Library({ programs, setPrograms, active, onClose, onLoad, create = false, canLoad = true }) {
  const [editing, setEditing] = useState(() => create ? {...PRESETS[0],id:commandId(),name:"האימון שלי",kind:"CUSTOM"} : null),
    [error, setError] = useState("");
  const file = useRef();
  const exportAll = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, programs }, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "barefit-workouts.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const importAll = async (e) => {
    try {
      const f = e.target.files[0];
      if (!f || f.size > 1000000) throw Error("הקובץ גדול מדי");
      const json = JSON.parse(await f.text());
      if (
        json.version !== 1 ||
        !Array.isArray(json.programs) ||
        json.programs.length > 100
      )
        throw Error("קובץ אימונים לא תקין");
      const data = json.programs.map(validateWorkout);
      setPrograms([
        ...programs,
        ...data.map((p) => ({ ...p, id: commandId() })),
      ]);
      setError("");
    } catch (e) {
      setError(e.message);
    }
    e.target.value = "";
  };
  return (
    <Overlay
      title={editing ? "עריכת תוכנית" : "בחירת אימון"}
      wide
      onClose={onClose}
    >
      {editing ? (
        <WorkoutForm
          workout={editing}
          onCancel={() => setEditing(null)}
          onSave={(w) => {
            setPrograms([...programs.filter((p) => p.id !== w.id), w]);
            setEditing(null);
          }}
        />
      ) : (
        <>
          <div className="library-heading">
            <p>בחרו אימון כדי להתחיל, או צרו אימון חדש.</p>
            <Button
              icon={Plus}
              onClick={() =>
                setEditing({
                  ...PRESETS[0],
                  id: commandId(),
                  name: "האימון שלי",
                  kind: "CUSTOM",
                })
              }
            >
              אימון חדש
            </Button>
          </div>
          <div className="program-list">
            {programs.map((p) => (
              <article
                key={p.id}
                className={p.id === active?.id ? "selected" : ""}
              >
                <div className="program-kind" dir="ltr">
                  {p.kind}
                </div>
                <div className="program-description">
                  <h3>{p.name}</h3>
                  <p>
                    {p.work} שנ׳ עבודה · {p.rest} שנ׳ מנוחה · {p.rounds} סבבים ·{" "}
                    {p.sets} סטים
                  </p>
                </div>
                <div className="program-actions">
                  <button
                    onClick={() =>
                      setEditing({
                        ...p,
                        id: commandId(),
                        name: p.name + " — העתק",
                      })
                    }
                  >
                    שכפול ועריכה
                  </button>
                  <button
                    disabled={!canLoad}
                    className="select-program"
                    onClick={() => onLoad(p)}
                    aria-label={"בחירה: " + p.name}
                  >
                    {p.id === active?.id ? (
                      <Check size={18} />
                    ) : (
                      <ArrowLeft size={18} />
                    )}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!canLoad && <p className="muted">אפשר לבנות ולשמור אימונים עכשיו. כדי לשלוח אימון, התחברו למסך כמאמן והשהו את השעון.</p>}
          <div className="library-footer">
            <button onClick={exportAll}>
              <Download size={17} /> ייצוא תוכניות
            </button>
            <button onClick={() => file.current.click()}>
              <Upload size={17} /> ייבוא תוכניות
            </button>
            <input
              ref={file}
              hidden
              type="file"
              accept=".json"
              onChange={importAll}
            />
          </div>
          {error && <p className="warning">{error}</p>}
        </>
      )}
    </Overlay>
  );
}
function WorkoutForm({ workout, onSave, onCancel }) {
  const [w, setW] = useState(workout),
    [err, setErr] = useState("");
  const fields = [
    ["work", "זמן עבודה", 1, 7200],
    ["rest", "זמן מנוחה", 0, 3600],
    ["rounds", "מספר סבבים", 1, 100],
    ["sets", "מספר סטים", 1, 20],
    ["between", "מנוחה בין סטים", 0, 3600],
    ["prepare", "זמן הכנה", 0, 300],
  ];
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          onSave(validateWorkout(w));
        } catch (e) {
          setErr(e.message);
        }
      }}
    >
      <label className="field">
        שם האימון
        <input
          value={w.name}
          maxLength={80}
          required
          onChange={(e) => setW({ ...w, name: e.target.value })}
        />
      </label>
      <div className="form-grid">
        {fields.map(([key, label, min, max]) => (
          <label className="field" key={key}>
            {label}
            {!["rounds", "sets"].includes(key) && <small>בשניות</small>}
            <input
              type="number"
              min={min}
              max={max}
              step="1"
              required
              value={w[key]}
              onChange={(e) => setW({ ...w, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
      {err && <p className="warning">{err}</p>}
      <div className="dialog-actions">
        <Button type="button" onClick={onCancel}>
          ביטול
        </Button>
        <Button primary type="submit" icon={Check}>
          שמירת תוכנית
        </Button>
      </div>
    </form>
  );
}
function DurationPicker({ label, hint, value, max, onChange }) {
  const choices = [20, 30, 45, 60, 120, 300, 600].filter((item) => item <= max);
  const change = (amount) => onChange(Math.max(1, Math.min(max, value + amount)));
  const display = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <div className="quick-picker">
      <div className="quick-picker-copy"><strong>{label}</strong><small>{hint}</small></div>
      <div className="stepper" dir="ltr">
        <button type="button" onClick={() => change(-5)} aria-label={`קיצור ${label}`}>−</button>
        <output>{display(value)}</output>
        <button type="button" onClick={() => change(5)} aria-label={`הארכת ${label}`}>+</button>
      </div>
      <div className="quick-choices" dir="ltr">
        {choices.map((item) => <button type="button" key={item} className={item === value ? "selected" : ""} onClick={() => onChange(item)}>{display(item)}</button>)}
      </div>
    </div>
  );
}
function CountPicker({ label, hint, value, onChange }) {
  const choices = [1, 2, 3, 4, 6, 8, 10, 12];
  const change = (amount) => onChange(Math.max(1, Math.min(100, value + amount)));
  return (
    <div className="quick-picker">
      <div className="quick-picker-copy"><strong>{label}</strong><small>{hint}</small></div>
      <div className="stepper" dir="ltr">
        <button type="button" onClick={() => change(-1)} aria-label={`הפחתת ${label}`}>−</button>
        <output>{value}</output>
        <button type="button" onClick={() => change(1)} aria-label={`הוספת ${label}`}>+</button>
      </div>
      <div className="quick-choices" dir="ltr">
        {choices.map((item) => <button type="button" key={item} className={item === value ? "selected" : ""} onClick={() => onChange(item)}>{item}</button>)}
      </div>
    </div>
  );
}
function WorkoutBuilder({ onSave, onCancel }) {
  const [mode, setMode] = useState(null);
  const [w, setW] = useState(null);
  const [err, setErr] = useState("");
  const selected = WORKOUT_MODES.find((item) => item.id === mode);
  const durationParts = (value) => {
    const total = Math.max(0, Number(value) || 0);
    return { minutes: Math.floor(total / 60), seconds: total % 60 };
  };
  const durationText = (value) => {
    const parts = durationParts(value);
    return `${String(parts.minutes).padStart(2, "0")}:${String(parts.seconds).padStart(2, "0")}`;
  };
  const setDurationPart = (key, part, value) => {
    const current = durationParts(w[key]);
    const next = part === "minutes"
      ? Number(value || 0) * 60 + current.seconds
      : current.minutes * 60 + Math.min(59, Number(value || 0));
    update(key, next);
  };
  const durationField = (key, label, maxMinutes = 120, hint = "בחרו זמן") => (
    <DurationPicker
      key={key}
      label={label}
      hint={hint}
      value={Number(w[key]) || 0}
      max={maxMinutes * 60}
      onChange={(value) => update(key, value)}
    />
  );
  const countField = (key, label, hint = "בחרו מספר") => (
    <CountPicker
      key={key}
      label={label}
      hint={hint}
      value={Number(w[key]) || 1}
      onChange={(value) => update(key, value)}
    />
  );
  const chooseMode = (item) => {
    setMode(item.id);
    setW({ ...item.defaults, id: commandId(), kind: item.id });
    setErr("");
  };
  const update = (key, value) => setW((current) => ({ ...current, [key]: value }));
  const save = (event) => {
    event.preventDefault();
    try {
      onSave(validateWorkout({ ...w, kind: mode }));
    } catch (error) {
      setErr(error.message);
    }
  };
  return (
    <Overlay title={selected ? `הגדרת ${selected.label}` : "בחירת סוג אימון"} wide onClose={onCancel}>
      {!selected ? (
        <>
          <p className="builder-intro">בחרו תבנית. אחר כך נגדיר יחד את הזמן, הסבבים והסטים.</p>
          <div className="mode-grid" role="list" aria-label="סוגי אימון">
            {WORKOUT_MODES.map((item) => (
              <button
                type="button"
                className="mode-option"
                style={{ "--mode-color": item.color }}
                key={item.id}
                onClick={() => chooseMode(item)}
              >
                <strong>{item.label}</strong>
                <em dir="ltr">{item.shortLabel}</em>
                <span>{item.description}</span>
              </button>
            ))}
          </div>
          <div className="dialog-actions"><Button type="button" onClick={onCancel}>ביטול</Button></div>
        </>
      ) : (
        <form className="builder-form" onSubmit={save}>
          <div className="builder-selected" style={{ "--mode-color": selected.color }}>
            <strong>{selected.label}</strong>
            <span>
              {mode === "EMOM"
                ? `מתחילים תרגיל חדש כל ${durationText(w.work)} · ${w.rounds || 0} דקות`
                : mode === "AMRAP"
                  ? `כמה שיותר סבבים במשך ${durationText(w.work)}`
                  : mode === "FOR TIME"
                    ? `מסיימים בתוך ${durationText(w.work)}`
                    : selected.description}
            </span>
          </div>
          <label className="field">שם האימון <small>אפשר להשאיר את השם המוצע</small><input value={w.name} maxLength={80} required onChange={(e) => update("name", e.target.value)} /></label>
          <div className="form-grid builder-fields">
            {durationField("work", mode === "EMOM" ? "כל כמה זמן מתחיל תרגיל חדש?" : mode === "AMRAP" ? "כמה זמן יש לאימון?" : mode === "FOR TIME" ? "מהו הזמן המקסימלי?" : "כמה זמן עובדים?")}
            {!["AMRAP", "FOR TIME", "EMOM"].includes(mode) && (
              durationField("rest", "כמה זמן נחים?", 60)
            )}
            {!['AMRAP', 'FOR TIME'].includes(mode) && countField("rounds", mode === "EMOM" ? "לכמה דקות האימון?" : "כמה סבבים?")}
            {mode === "MIX" && countField("sets", "כמה סטים?", "לא חובה")}
            {mode === "MIX" && durationField("between", "מנוחה בין סטים", 60)}
          </div>
          <p className="builder-summary">
            {mode === "AMRAP" && `סבבים חופשיים במשך ${durationText(w.work)}`}
            {mode === "FOR TIME" && `מסיימים בתוך ${durationText(w.work)}`}
            {mode === "EMOM" && `משימה חדשה כל ${durationText(w.work)}, ${w.rounds || 0} פעמים`}
            {mode === "TABATA" && `${durationText(w.work)} עבודה · ${durationText(w.rest)} מנוחה · ${w.rounds || 0} סבבים`}
            {mode === "MIX" && `${w.rounds || 0} סבבים × ${w.sets || 0} סטים`}
          </p>
          {err && <p className="warning">{err}</p>}
          <div className="dialog-actions">
            <Button type="button" onClick={() => setMode(null)}>חזרה לסוגים</Button>
            <Button primary type="submit" icon={Check}>שמירה ובחירה</Button>
          </div>
        </form>
      )}
    </Overlay>
  );
}
function Coach() {
  const [target, setTarget] = useState(() => {
    const base = read('hub',location.origin);
    const requested=new URLSearchParams(location.search).get('studio');
    const studioId=['1','2'].includes(requested)?requested:read('studio-id','1');
    return {base,studioId,credentials:read(`coach:${base}:studio:${studioId}`,studioId==='1'?read('coach:'+base,null):null)};
  });
  const {base,studioId,credentials}=target;
  const phoneSettingsKey=`coach-settings:${base}:studio:${studioId}`;
  const defaultPhoneSettings=DEFAULT_SETTINGS;
  const [phoneSettings,setPhoneSettings]=useState(()=>read(phoneSettingsKey,defaultPhoneSettings));
  const savePhoneSettings=(value,key=phoneSettingsKey)=>{
    setPhoneSettings(value);
    if(!write(key,value))setError("שמירת ההגדרות בטלפון נכשלה");
  };
  const setCredentials=(credentials)=>setTarget(t=>({...t,credentials}));
  const [status, setStatus] = useState("disconnected");
  const [view, setView] = useState(null);
  const [role, setRole] = useState("viewer");
  const [hostOnline, setHostOnline] = useState(false);
  const [error, setError] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [panel, setPanel] = useState(null);
  const [name, setName] = useState("הטלפון שלי");
  const pairing=useRef(false);
  const [pairBusy,setPairBusy]=useState(false);
  const [studios,setStudios]=useState([]);
  const [studioLoading,setStudioLoading]=useState(false);
  const [manualRoom, setManualRoom] = useState(""),
    [manualCode, setManualCode] = useState("");
  const [programs, setPrograms] = useState(() => read("programs", PRESETS));
  const conn = useRef(null);
  const sequence = useRef(read("sequence:" + base, 0));
  const [pending, setPending] = useState(null);
  const lastCoachStatus = useRef("ready");
  const hash = new URLSearchParams(location.hash.slice(1));
  const room = hash.get("room") || manualRoom,
    code = hash.get("code") || manualCode;
  useEffect(()=>{setPhoneSettings(read(phoneSettingsKey,defaultPhoneSettings));},[phoneSettingsKey]);
  useEffect(()=>{
    let live=true;
    const refresh=async()=>{
      setStudioLoading(true);
      try{const response=await fetch(`${base}/api/studios`,{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'שגיאה בטעינת הסטודיואים');if(live)setStudios(data.studios||[]);}
      catch{if(live)setStudios([]);}
      finally{if(live)setStudioLoading(false);}
    };
    refresh();const timer=setInterval(refresh,5000);
    return()=>{live=false;clearInterval(timer);};
  },[base]);
  useEffect(() => {
    if (!credentials) return;
    let cancelled = false;
    let hasPhoneSettings=!!read(phoneSettingsKey,null);
    const sync=new SettingsSync(()=>read(phoneSettingsKey,null),(command,payload)=>{
      c.send({type:'command',id:commandId(),sequence:++sequence.current,command,payload});
    });
    const c = new Connection(
      base,
      { ...credentials, role: credentials.pending ? "pending" : "coach" },
      (m) => {
        if (cancelled) return;
        if (m.type === "authenticated") {
          setRole(m.role);
          sequence.current = Math.max(sequence.current, m.sequence || 0);
          setWaiting(false);
        }
        if (m.type === "waiting") setWaiting(true);
        if (m.type === "paired") {
          const data = { room: credentials.room, token: m.token };
          write(`coach:${base}:studio:${studioId}`, data);
          setCredentials(data);
          setWaiting(false);
          history.replaceState({}, "", location.pathname + `?mode=coach&v=auto-pair-6&studio=${studioId}`);
        }
        if (m.type === "rejected") {
          setWaiting(false);
          setCredentials(null);
          setError("בקשת החיבור נדחתה או פגה. סרקו קוד חדש.");
        }
        if (m.type === "host-status") setHostOnline(m.online);
        if(m.type==='role-update'){
          setRole(m.role);
          sequence.current=m.sequence||0;
          setPending(null);
          setError(m.role==='controller'?'השליטה הועברה לטלפון הזה':'השליטה הועברה למכשיר אחר');
        }
        if (m.type === "state") {
          setView(m.state);
          if(!hasPhoneSettings&&m.state.studioSettings){
            const migrated=normalizeSettings(m.state.studioSettings);
            hasPhoneSettings=true;
            savePhoneSettings(migrated,phoneSettingsKey);
          }
        }
        if (m.type === "ack") {
          setPending(current=>current===m.id?null:current);
          if (!m.ok) setError(m.error);
        }
        sync.update(m);
      },
      (s) => {
        if (cancelled) return;
        setStatus(s);
        if(s!=='connected'){setHostOnline(false);sync.reset();}
        if (s === "unauthorized") {
          write(`coach:${base}:studio:${studioId}`, null);
          setCredentials(null);
          setWaiting(false);
          setError("החיבור פג. סרקו קוד חדש מהמסך.");
        }
      },
    );
    conn.current = c;
    return () => { cancelled = true; c.close(); };
  }, [credentials, base,studioId,phoneSettingsKey]);
  useEffect(() => {
    if (!pending) return;
    const id = setTimeout(() => {
      setPending(null);
      setError("לא התקבל אישור. בדקו את מצב המסך לפני ניסיון נוסף.");
    }, 6000);
    return () => clearTimeout(id);
  }, [pending]);
  useEffect(() => {
    if (view?.status === "finished" && lastCoachStatus.current !== "finished") setPanel("session-menu");
    if (view?.status) lastCoachStatus.current = view.status;
  }, [view?.status]);
  const execute = (type, payload) => {
    if (
      status !== "connected" ||
      !hostOnline ||
      role !== "controller" ||
      pending
    )
      return false;
    const settingKey={SET_VOLUME:'volume',SET_MUTE:'muted',SET_VOICE:'voice',SET_COUNTDOWN:'countdown',SET_HALL:'hall',SET_CLEAN:'clean'}[type];
    if(settingKey)savePhoneSettings({...phoneSettings,[settingKey]:payload});
    const id = commandId();
    sequence.current++;
    write(`sequence:${base}:studio:${studioId}`, sequence.current);
    if (
      !conn.current.send({
        type: "command",
        id,
        sequence: sequence.current,
        command: type,
        payload,
      })
    ) {
      setError("החיבור נותק");
      return false;
    }
    setPending(id);
    return true;
  };
  const connectPair = async ({base:destination=base,room:targetRoom=room,code:targetCode=code,qrToken,studioId:targetStudio=studioId}={}) => {
    if(pairing.current)return;
    pairing.current=true;setPairBusy(true);setError('');
    try {
      const saved=read(`coach:${destination}:studio:${targetStudio}`,targetStudio==='1'?read('coach:'+destination,null):null);
      const existingToken=saved?.room===targetRoom ? saved.token : undefined;
      const data=await request(destination,'/api/pair',{room:targetRoom,code:targetCode,name,qrToken,existingToken});
      conn.current?.close();
      setView(null);setHostOnline(false);setRole('viewer');setPending(null);sequence.current=0;
      write('hub',destination);
      const nextCredentials=data.paired ? {room:data.room,token:data.token} : {...data,pending:true};
      if(data.paired){
        write(`coach:${destination}:studio:${targetStudio}`,nextCredentials);
        history.replaceState({},'',location.pathname+`?mode=coach&v=auto-pair-6&studio=${targetStudio}`);
      }
      setPhoneSettings(read(`coach-settings:${destination}:studio:${targetStudio}`,defaultPhoneSettings));
      setTarget({base:destination,studioId:targetStudio,credentials:nextCredentials});
      setWaiting(!data.paired);setPanel(null);
    }catch(e){setError(e.message);setPanel(null);}
    finally{pairing.current=false;setPairBusy(false);}
  };
  const pair=(e)=>{
    e.preventDefault();
    try { void connectPair(hash.get('room') ? parsePairQr(location.href) : undefined); }
    catch(error) { setError(error.message); }
  };
  const connectStudio=async(id)=>{
    if(pairing.current)return;
    pairing.current=true;setPairBusy(true);setError('');
    try{
      const saved=read(`coach:${base}:studio:${id}`,null);
      const data=await request(base,'/api/connect-studio',{studioId:id,name,existingToken:saved?.token});
      const nextCredentials={room:data.room,token:data.token};
      write(`coach:${base}:studio:${id}`,nextCredentials);write('hub',base);write('studio-id',id);
      conn.current?.close();setView(null);setHostOnline(false);setRole('controller');setPending(null);sequence.current=0;
      setPhoneSettings(read(`coach-settings:${base}:studio:${id}`,defaultPhoneSettings));
      setTarget({base,studioId:id,credentials:nextCredentials});setWaiting(false);setPanel(null);
      history.replaceState({},'',location.pathname+`?mode=coach&v=auto-pair-6&studio=${id}`);
    }catch(e){setError(e.message);}
    finally{pairing.current=false;setPairBusy(false);}
  };
  const canLoad=role==='controller'&&status==='connected'&&hostOnline&&!pending&&view?.status!=='running';
  return (
    <main className="coach">
      <header className="coach-header">
        <Brand small />
        <span>
          <span
            className={
              "status-dot " +
              (status === "connected" && hostOnline ? "online" : "")
            }
          />
          {status === "connected" && hostOnline ? "מחובר למסך" : "לא מחובר"}
        </span>
      </header>
      <nav className="phone-actions" aria-label="פעולות בטלפון">
        <Button primary icon={Plus} onClick={()=>setPanel('builder')}>בניית אימון</Button>
        <Button icon={Camera} onClick={()=>setPanel('scan')} disabled={pairBusy||waiting}>סריקת QR</Button>
        <Button icon={BookOpen} onClick={()=>setPanel('library')}>האימונים שלי</Button>
        {credentials&&<Button icon={Monitor} onClick={()=>{setTarget(t=>({...t,credentials:null}));setView(null);setHostOnline(false);}}>בחירת סטודיו</Button>}
        <a className="action" href="?mode=display">אימון בטלפון</a>
      </nav>
      {pairBusy ? (
        <section className="coach-pair" role="status"><Monitor size={42}/><h1>מתחברים למסך…</h1><p>פרטי החיבור זוהו מהקוד. אין צורך להקליד דבר.</p></section>
      ) : !credentials ? (
        <section className="coach-pair">
          <Smartphone size={42} />
          <h1>לאיזה סטודיו מתחברים?</h1>
          <p>בחרו את המסך באולם. החיבור מעביר את השליטה למאמן הזה ומנתק שליטה קודמת באותו סטודיו.</p>
          <label className="field">שם המאמן או המכשיר<input value={name} onChange={e=>setName(e.target.value)} maxLength={60} /></label>
          <div className="studio-picker">
            {["1","2"].map(id=>{
              const active=studios.find(s=>s.id===id);
              return <Button key={id} primary={!!active} disabled={!active||pairBusy} icon={Monitor} onClick={()=>connectStudio(id)}>
                <span>סטודיו {id}</span><small>{active?"מחובר וזמין":"המסך לא מחובר"}</small>
              </Button>;
            })}
          </div>
          <p className="muted">{studioLoading?"בודקים אילו מסכים זמינים…":"המסכים הזמינים מתעדכנים אוטומטית."}</p>
          <details className="manual-pair"><summary>חיבור ידני עם QR או קוד</summary><form onSubmit={pair}>
            <label className="field">מזהה מסך<input value={manualRoom||hash.get('room')||''} onChange={e=>setManualRoom(e.target.value)} required /></label>
            <label className="field">קוד חיבור<input value={manualCode||hash.get('code')||''} onChange={e=>setManualCode(e.target.value)} required /></label>
            <Button type="submit" disabled={pairBusy}>חיבור ידני</Button>
          </form></details>
        </section>
      ) : waiting ? (
        <section className="coach-pair">
          <Monitor size={42} />
          <h1>ממתינים למסך סטודיו {studioId}</h1>
          <p>השאירו מסך הסטודיו פתוח כדי להשלים את החיבור.</p>
        </section>
      ) : view ? (
        <>
          <div className="coach-title">
            <span className="eyebrow">סטודיו {studioId} · מסך האימון</span>
            <h1>{view.workout.name}</h1>
            <p>{role === "controller" ? "שליטת מאמן" : "צפייה בלבד"}</p>
          </div>
          <TimerFace view={view} compact />
          <fieldset
            disabled={
              role !== "controller" ||
              status !== "connected" ||
              !hostOnline ||
              !!pending
            }
          >
            <Controls
              view={view}
              execute={execute}
              stop={() => setPanel("stop")}
            />
            <div className="coach-extra">
              <Button icon={SkipBack} onClick={() => execute("PREVIOUS_PHASE")}>
                שלב קודם
              </Button>
              <Button icon={BookOpen} onClick={() => setPanel("library")}>
                בחירת אימון
              </Button>
              {role==='controller' && <Button icon={SlidersHorizontal} onClick={()=>setPanel('remote-settings')}>הגדרות מסך</Button>}
            </div>
          </fieldset>
          <div className="coach-status">
            {pending
              ? "ממתין לאישור הפעולה מהמסך"
              : !hostOnline || status !== "connected"
                ? "החיבור נותק. השעון בטלוויזיה ממשיך לפעול."
                : "השעון מסונכרן עם מסך האימון"}
          </div>
        </>
      ) : (
        <section className="coach-pair">
          <h1>מתחברים למסך…</h1>
          <p>ודאו שהמסך פתוח ומחובר לרשת.</p>
        </section>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
          <button onClick={() => setError("")} aria-label="סגירת שגיאה">
            <X size={18} />
          </button>
        </div>
      )}
      {panel === "stop" && (
        <Overlay title="לעצור את האימון?" onClose={() => setPanel(null)}>
          <p>השעון בטלוויזיה יחזור להתחלה.</p>
          <Button
            primary
            onClick={() => {
              execute("STOP");
              setPanel(null);
            }}
          >
            עצירת אימון
          </Button>
        </Overlay>
      )}
      {panel==='remote-settings' && <RemoteSettings settings={phoneSettings} execute={execute} onClose={()=>setPanel(null)}/>}
      {panel === 'session-menu' && <SessionMenu finished onClose={()=>setPanel(null)} onBuilder={()=>setPanel('builder')} onLibrary={()=>setPanel('library')} onRestart={()=>{execute('START');setPanel(null);}} />}
      {panel === 'scan' && <Overlay title="סריקת קוד מהמסך" onClose={()=>setPanel(null)}><QrScanner onScan={connectPair}/></Overlay>}
      {panel === 'builder' && <WorkoutBuilder onCancel={()=>setPanel(null)} onSave={(workout)=>{
        const next=[...programs.filter((item)=>item.id!==workout.id),workout];
        setPrograms(next);
        if(!write('programs',next)) setError('שמירת האימון בטלפון נכשלה');
        if(canLoad && execute('LOAD_WORKOUT',workout)) setPanel(null);
        else { setPanel('library'); setError('האימון נשמר בטלפון. התחברו למסך כדי להפעיל אותו.'); }
      }} />}
      {(panel === "library" || panel === 'create') && (
        <Library
          active={view?.workout}
          create={panel === "create"}
          canLoad={canLoad}
          programs={programs}
          setPrograms={(p) => {
            setPrograms(p);
            if(!write("programs", p))setError("שמירת האימונים בטלפון נכשלה");
          }}
          onClose={() => setPanel(null)}
          onLoad={(p) => {
            if(execute("LOAD_WORKOUT", p))setPanel(null);
          }}
        />
      )}
      <footer className="coach-footer"><div className="creator-credit" dir="rtl">נוצר על ידי <bdi>Tomer AI Studio</bdi></div></footer>
    </main>
  );
}

function RemoteSettings({settings,execute,onClose}) {
  const send=(command,value)=>execute(command,value);
  return <Overlay title="הגדרות מסך הטלוויזיה" onClose={onClose}>
    <p>האימונים וההגדרות נשמרים בטלפון ומסתנכרנים למסך. השעון ממשיך לפעול בטלוויזיה גם כשהטלפון מנותק.</p>
    <label className="field">עוצמת קול · {Math.round((settings.volume??0.8)*100)}%<input type="range" min="0" max="1" step="0.1" value={settings.volume??0.8} onChange={e=>send('SET_VOLUME',Number(e.target.value))}/></label>
    <label className="toggle-row"><span>צלילים במסך הטלוויזיה</span><input type="checkbox" checked={!settings.muted} onChange={e=>send('SET_MUTE',!e.target.checked)}/></label>
    <label className="toggle-row"><span>קריינות מאמן בעברית</span><input type="checkbox" checked={settings.voice??true} onChange={e=>send('SET_VOICE',e.target.checked)}/></label>
    <label className="field">ספירה לאחור<select value={settings.countdown??10} onChange={e=>send('SET_COUNTDOWN',Number(e.target.value))}><option value="10">3 שניות בסבב רגיל · 10 באחרון</option><option value="0">ללא קריינות ספירה</option></select></label>
    <label className="toggle-row"><span>מצב אולם · ספרות גדולות</span><input type="checkbox" checked={settings.hall??true} onChange={e=>send('SET_HALL',e.target.checked)}/></label>
    <label className="toggle-row"><span>הסרת צילום הרקע</span><input type="checkbox" checked={!!settings.clean} onChange={e=>send('SET_CLEAN',e.target.checked)}/></label>
  </Overlay>;
}
