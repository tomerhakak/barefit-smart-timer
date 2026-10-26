import React, {useEffect,useRef,useState} from 'react';
import {Camera} from 'lucide-react';
import jsQR from 'jsqr';
import {parsePairQr} from '../shared/pairing.mjs';

export default function QrScanner({onScan}) {
  const video=useRef(null), stream=useRef(null), timer=useRef(null), found=useRef(false), alive=useRef(true);
  const [error,setError]=useState(''), [active,setActive]=useState(false), [busy,setBusy]=useState(false);
  const live=window.isSecureContext && !!navigator.mediaDevices?.getUserMedia;
  const stop=()=>{clearTimeout(timer.current);stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;};
  useEffect(()=>()=>{alive.current=false;stop();},[]);
  const accept=(text)=>{
    const parsed=parsePairQr(text);
    if(found.current)return;
    found.current=true;stop();setActive(false);onScan(parsed);
  };
  const decode=(source,width,height)=>{
    const scale=Math.min(1,1200/Math.max(width,height));
    const canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
    return jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})?.data;
  };
  const start=async()=>{
    setError('');setBusy(true);found.current=false;
    try {
      const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280}}});
      if(!alive.current){media.getTracks().forEach(t=>t.stop());return;}
      stream.current=media;video.current.srcObject=media;await video.current.play();setActive(true);
      const tick=()=>{
        if(!alive.current||found.current||!stream.current)return;
        try {
          const v=video.current;
          if(v.readyState>=2&&v.videoWidth){const text=decode(v,v.videoWidth,v.videoHeight);if(text){accept(text);return;}}
        } catch(e){setError(e.message);}
        timer.current=setTimeout(tick,220);
      };tick();
    } catch(e) {
      stop();setError('המצלמה באתר אינה זמינה. פתחו את אפליקציית המצלמה בטלפון, כוונו לקוד במסך ולחצו על הקישור שיופיע.');
    } finally {if(alive.current)setBusy(false);}
  };
  return <div className="qr-scanner">
    <h3>המצלמה הרגילה מספיקה</h3>
    <ol><li>במסך האימון לחצו על ״חיבור מאמן״.</li><li>פתחו את המצלמה בטלפון וכוונו אל קוד ה־QR — בלי ללחוץ על צילום.</li><li>לחצו על הקישור שמופיע. האתר ישלים את החיבור אוטומטית.</li></ol>
    <p className="muted">חברו את הטלפון לאותה רשת Wi-Fi של המסך. באייפון השתמשו במצלמה או בסורק הקודים; באנדרואיד במצלמה, בסורק QR או ב־Google Lens.</p>
    {live&&<><video ref={video} aria-hidden={!active} autoPlay playsInline muted className={active?'scanner-video':'scanner-video inactive'} /><button className="action" onClick={start} disabled={busy||active}><Camera size={22}/>{busy?'פותח מצלמה…':active?'מחפש קוד…':'סריקה ישירות באתר'}</button></>}
    {error&&<p className="warning" role="alert">{error}</p>}
  </div>;
}
