import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { WorkoutEngine, PRESETS } from '../shared/engine.mjs';
import { CueTracker, roundNotice, COACH_ASSETS } from '../shared/cues.mjs';

function setup(extra={}) {
  let now=0;
  const engine=new WorkoutEngine({...PRESETS[0],prepare:0,work:20,rest:15,rounds:2,sets:1,...extra},()=>now);
  const tracker=new CueTracker();
  return {engine,tracker,advance:(n)=>{now+=n;return engine.view();},cue:()=>tracker.update(engine.view())};
}
test('final round announces each current second 10 through 1 once',()=>{
  const t=setup(); t.engine.start(); t.cue();
  t.advance(35000); assert.equal(t.cue().voice,'last'); t.advance(10000);
  for(let n=10;n>=1;n--) {
    assert.equal(t.cue().voice,String(n));
    assert.equal(t.cue(),null);
    t.advance(1000);
  }
  assert.equal(t.cue().voice,'finish');
});
test('delayed tick only announces the current number, never queued missed counts',()=>{
  const t=setup();t.engine.start();t.cue();t.advance(35000);t.cue();t.advance(10000);assert.equal(t.cue().voice,'10');
  t.advance(3400); assert.equal(t.cue().voice,'7'); assert.equal(t.cue(),null);
});
test('pause cancels audio, resume does not replay the same number, stop/restart resets',()=>{
  const t=setup();t.engine.start();t.cue();t.advance(17000);assert.equal(t.cue().voice,'3');
  t.engine.pause();assert.deepEqual(t.cue(),{stop:true});t.advance(10000);assert.equal(t.cue(),null);
  t.engine.start();assert.equal(t.cue(),null);t.advance(1000);assert.equal(t.cue().voice,'2');
  t.engine.stop();assert.deepEqual(t.cue(),{stop:true});t.engine.start();assert.equal(t.cue().voice,'work');
});
test('only the final round of the entire workout is announced',()=>{
  const t=setup({rounds:1,sets:2,between:15});t.engine.start();assert.equal(t.cue().voice,'work');
  assert.equal(roundNotice(t.engine.view()),'');
  t.advance(20000);assert.deepEqual(t.cue(),{tone:'tone-rest',voice:null});
  t.advance(15000);assert.equal(t.cue().voice,'last');assert.equal(roundNotice(t.engine.view()),'סיבוב אחרון');
  t.engine.pause();t.cue();t.engine.start();assert.equal(t.cue(),null);
});
test('custom steps use last work phase, including when a cooldown follows',()=>{
  const t=setup({steps:[{type:'work',seconds:20},{type:'rest',seconds:15},{type:'work',seconds:20},{type:'rest',seconds:20}]});
  t.engine.start();assert.equal(t.cue().voice,'work');t.advance(35000);
  assert.equal(t.cue().voice,'last'); assert.equal(roundNotice(t.engine.view()),'סיבוב אחרון');
});
test('short last round speaks the exact displayed number without overlap',()=>{
  const t=setup({work:5,rounds:2});t.engine.start();t.cue();t.advance(20000);assert.equal(t.cue().voice,'5');
  t.advance(1000);assert.equal(t.cue().voice,'4');t.advance(4000);assert.equal(t.cue().voice,'finish');
  assert.equal(t.cue(),null);t.advance(60000);assert.equal(t.cue(),null);
});
test('regular rounds and rests count only 3,2,1; rest starts with a tone only',()=>{
  const t=setup();t.engine.start();assert.equal(t.cue().voice,'work');
  t.advance(10000);assert.equal(t.cue(),null);t.advance(7000);
  for(const number of ['3','2','1']) {assert.equal(t.cue().voice,number);t.advance(1000);}
  assert.deepEqual(t.cue(),{tone:'tone-rest',voice:null});
  t.advance(5000);assert.equal(t.cue(),null);t.advance(7000);
  for(const number of ['3','2','1']) {assert.equal(t.cue().voice,number);t.advance(1000);}
  assert.equal(t.cue().voice,'last');
});
test('long single efforts and AMRAP never announce a final round or count from ten',()=>{
  for(const workout of [{work:1200,rounds:1},{work:1200,rounds:1,kind:'AMRAP'},{work:1200,rounds:2,kind:'AMRAP'}]) {
    const t=setup(workout);t.engine.start();assert.equal(t.cue().voice,'work');
    assert.equal(roundNotice(t.engine.view()),'');
    t.advance(1190000);assert.equal(t.cue(),null);t.advance(7000);assert.equal(t.cue().voice,'3');
    if(workout.rounds===2) { t.advance(18000); assert.equal(t.cue().voice,'work');assert.equal(roundNotice(t.engine.view()),''); }
  }
});
test('voice and countdown can be disabled independently of transition tones',()=>{
  const t=setup();t.engine.start();assert.deepEqual(t.tracker.update(t.engine.view(),{voice:false}),{tone:'tone-work',voice:null});
  t.advance(17000);assert.deepEqual(t.tracker.update(t.engine.view(),{voice:false}),{tone:'tone-tick',voice:null});
  t.advance(1000);assert.equal(t.tracker.update(t.engine.view(),{countdown:0}),null);
});
test('packaged sounds are real PCM WAV; every spoken number fits its one-second slot',()=>{
  for (const id of COACH_ASSETS) {
    const b=readFileSync(new URL(`../public/assets/coach/${id}.wav`,import.meta.url));
    assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');
    assert.equal(b.readUInt16LE(20),1);assert.equal(b.readUInt16LE(34),16);
    const seconds=b.readUInt32LE(40)/b.readUInt32LE(28);
    assert.ok(seconds>.05);
    if (/^\d+$/.test(id)) assert.ok(seconds<=.92,`${id}: ${seconds}`);
  }
});
