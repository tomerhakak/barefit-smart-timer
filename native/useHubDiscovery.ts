import {useEffect, useRef, useState} from 'react';
import {AppState, NativeModules, Platform} from 'react-native';
import {locateHub} from '../shared/discovery.mjs';

export function useHubDiscovery({ready, base, load, save, onFound}: any) {
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState(0);
  const latest = useRef({load, save, onFound, base});
  latest.current = {load, save, onFound, base};
  // The TV hosts its own hub. Discovery is only needed by the phone when it
  // is looking for an already-running screen on the LAN.
  const supported = Platform.OS === 'android' && !Platform.isTV && !!NativeModules.BareFitDiscovery;
  useEffect(() => {
    if (!ready || !supported) return;
    let cancelled = false, busy = false;
    const check = async () => {
      if (cancelled || busy || (AppState.currentState && AppState.currentState !== 'active')) return;
      busy = true;
      const active = () => !cancelled && latest.current.base === base;
      try {
        const stored = await latest.current.load('hub-identity');
        if (!active()) return;
        const knownId = stored?.base === base ? stored.id : undefined;
        const result = await locateHub({base, knownId, discover: async () => {
          if (!active()) return [];
          setMessage('מחפש את שירות BareFit ברשת…');
          return NativeModules.BareFitDiscovery.scan();
        }});
        if (!active()) return;
        if (result.state === 'ambiguous') {
          setMessage('נמצאו כמה שירותים. בחרו את כתובת המחשב המתאים פעם אחת.'); return;
        }
        if (result.state !== 'connected' || !('base' in result) || !('id' in result)) {
          setMessage('השירות לא נמצא. ננסה שוב אוטומטית; השעון ממשיך במכשיר.'); return;
        }
        if (result.base !== base) {
          // Move both studios' credentials only when rediscovering the known hub.
          // A fresh discovery never inherits credentials from a different service.
          if (knownId === result.id) {
            for (const studio of ['1','2']) {
              for (const prefix of ['host', 'coach', 'coach-settings']) {
                let value = await latest.current.load(`${prefix}:${base}:studio:${studio}`);
                if (!value && prefix === 'host' && studio === '1') value = await latest.current.load('host:' + base);
                if (!active()) return;
                if (value) await latest.current.save(`${prefix}:${result.base}:studio:${studio}`, value);
              }
            }
          }
          if (!active()) return;
          // Save the URL before publishing it to React; a failed write keeps the old connection.
          await latest.current.save('hub', result.base);
        }
        if (!active()) return;
        if (stored?.id !== result.id || stored?.base !== result.base)
          await latest.current.save('hub-identity', {id:result.id, base:result.base});
        if (!active()) return;
        setMessage(result.base === base ? 'בדיקת כתובת אוטומטית פעילה' : 'כתובת השירות עודכנה אוטומטית');
        if (result.base !== base) latest.current.onFound(result.base);
      } catch {
        if (active()) setMessage('החיפוש האוטומטי לא זמין כרגע. ננסה שוב; אפשר להזין כתובת ידנית.');
      } finally { busy = false; }
    };
    void check();
    const interval = setInterval(check, 30000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void check(); });
    return () => { cancelled = true; clearInterval(interval); subscription.remove(); };
  }, [ready, base, supported, search]);
  return {supported, message, searchNow:() => setSearch(value => value + 1)};
}
