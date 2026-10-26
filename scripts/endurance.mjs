import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {WorkoutEngine,PRESETS,buildPhases} from '../shared/engine.mjs';
import {CueTracker,COACH_ASSETS} from '../shared/cues.mjs';

// Accelerated engine/audio-policy soak, not physical TV or audio-driver proof.
assert.equal(typeof global.gc,'function','Run with node --expose-gc scripts/endurance.mjs');
const started=performance.now();
const plans=[{...PRESETS[0],work:20,rest:10,rounds:100,sets:20,between:10},...PRESETS];
const allowed=new Set(COACH_ASSETS);
function soak(hours,offset){
  let clock=0,active=0,cycles=0,ticks=0,cues=0,restores=0,pauses=0,missed=0;
  let engine=new WorkoutEngine(plans[offset%plans.length],()=>clock),tracker=new CueTracker();
  let duration=buildPhases(engine.workout).reduce((sum,p)=>sum+p.duration,0);
  engine.start();
  while(clock<hours*3600000){
    const delta=ticks%7919===7918?127419:100;
    if(delta>100)missed++;
    clock+=delta;active+=delta;ticks++;
    const view=engine.view();
    assert.equal(view.totalRemaining,Math.max(0,duration-active));
    assert.ok(Number.isFinite(view.remaining)&&view.remaining>=0&&view.remaining<=view.duration);
    const cue=tracker.update(view);
    if(cue){cues++;if(cue.voice)assert.ok(allowed.has(cue.voice));if(cue.tone)assert.ok(allowed.has(cue.tone));}
    if(ticks%100===0){
      const snapshot=JSON.parse(JSON.stringify(engine.snapshot()));
      assert.ok(snapshot.index<view.phaseCount);
    }
    if(view.status==='finished'){
      cycles++;engine.load(plans[(cycles+offset)%plans.length]);
      duration=buildPhases(engine.workout).reduce((sum,p)=>sum+p.duration,0);active=0;engine.start();
    }else if(ticks%60001===0){
      const remaining=view.totalRemaining;
      engine.pause();tracker.update(engine.view());clock+=11000;
      assert.equal(engine.view().totalRemaining,remaining);engine.start();pauses++;
    }else if(ticks%130003===0){
      const before=engine.view(),snapshot=JSON.parse(JSON.stringify(engine.snapshot()));
      engine=new WorkoutEngine(PRESETS[0],()=>clock);engine.restore(snapshot);
      assert.equal(engine.view().status,'paused');assert.equal(engine.view().totalRemaining,before.totalRemaining);
      engine.start();tracker=new CueTracker();restores++;
    }
  }
  return {simulatedHours:clock/3600000,ticks,cues,completedWorkouts:cycles,pauseResumeCycles:pauses,recoveredSnapshots:restores,missedCallbackGaps:missed};
}
soak(1,0);global.gc();
const before=process.memoryUsage().heapUsed;
const studios=[soak(72,0),soak(72,3)];
global.gc();const after=process.memoryUsage().heapUsed;
const retainedHeapGrowthBytes=after-before;
assert.ok(retainedHeapGrowthBytes<8*1024*1024,`Unexpected retained heap growth: ${retainedHeapGrowthBytes}`);
const report={scope:'Accelerated shared timer and cue policy; not a hardware endurance test',passed:true,studios,retainedHeapGrowthBytes,heapAfterGcBytes:after,actualRuntimeSeconds:(performance.now()-started)/1000};
await writeFile('artifacts/endurance-0.3.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
