import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { Cue } from '../shared/cues.mjs';

const sources = {
  '1': require('../public/assets/coach/1.wav'), '2': require('../public/assets/coach/2.wav'),
  '3': require('../public/assets/coach/3.wav'), '4': require('../public/assets/coach/4.wav'),
  '5': require('../public/assets/coach/5.wav'), '6': require('../public/assets/coach/6.wav'),
  '7': require('../public/assets/coach/7.wav'), '8': require('../public/assets/coach/8.wav'),
  '9': require('../public/assets/coach/9.wav'), '10': require('../public/assets/coach/10.wav'),
  work: require('../public/assets/coach/work.wav'), rest: require('../public/assets/coach/rest.wav'),
  prepare: require('../public/assets/coach/prepare.wav'), between: require('../public/assets/coach/between.wav'),
  last: require('../public/assets/coach/last.wav'), 'last-set': require('../public/assets/coach/last-set.wav'),
  finish: require('../public/assets/coach/finish.wav'),
  'tone-work': require('../public/assets/coach/tone-work.wav'),
  'tone-rest': require('../public/assets/coach/tone-rest.wav'),
  'tone-prepare': require('../public/assets/coach/tone-prepare.wav'),
  'tone-tick': require('../public/assets/coach/tone-tick.wav'),
  'tone-finish': require('../public/assets/coach/tone-finish.wav'),
};

export class NativeCoachAudio {
  players = new Map<string, ReturnType<typeof createAudioPlayer>>();
  epoch = 0;
  previewTimer: ReturnType<typeof setTimeout>;
  constructor(private report: (message:string)=>void) {
    // Mix with the gym's music; voice and transition tones have separate gain.
    setAudioModeAsync({playsInSilentMode:true,interruptionMode:'mixWithOthers'})
      .catch(()=>report('לא ניתן להגדיר את השמע. בדקו קול לפני האימון.'));
    for (const [id, source] of Object.entries(sources)) {
      this.players.set(id, createAudioPlayer(source, {downloadFirst:true,keepAudioSessionActive:true}));
    }
  }
  stop() {
    this.epoch++;
    clearTimeout(this.previewTimer);
    this.players.forEach(p=>{ try {p.pause();} catch {} });
  }
  async play(cue: Cue, volume:number) {
    if (!cue) return;
    this.stop();
    const epoch = this.epoch, deadline = Date.now()+400;
    if (cue.stop || volume <= 0) return;
    await Promise.all([[cue.tone, cue.voice ? volume*.26 : volume*.7], [cue.voice, volume]].map(async ([id,gain])=>{
      const player = this.players.get(id as string);
      if (!player) return;
      try {
        await player.seekTo(0);
        if (epoch !== this.epoch || Date.now()>deadline) return;
        player.volume = gain as number;
        player.play();
      } catch { this.report('השמעת ההתראה נכשלה. בדקו קול במכשיר.'); }
    }));
  }
  preview(volume:number,voice:boolean) {
    this.stop();
    const cues: Cue[] = [{tone:'tone-work',voice:voice?'last':null},...Array.from({length:10},(_,i)=>({voice:voice?String(10-i):null,tone:'tone-tick'})),{tone:'tone-finish',voice:voice?'finish':null}];
    let index=0;
    const next=()=>{
      const cue=cues[index++];
      if (!cue) return;
      void this.play(cue,volume);
      this.previewTimer=setTimeout(next,index===1?1250:1000);
    };
    next();
  }
  dispose() { this.stop(); this.players.forEach(p=>p.remove()); this.players.clear(); }
}
