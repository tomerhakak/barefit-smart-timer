import test from 'node:test';
import assert from 'node:assert/strict';
import { CoachAudio } from '../src/coachAudio.js';

test('audio preloads offline assets, stops previous voices and cancels pending demo on pause',async()=>{
  const oldWindow=globalThis.window,oldFetch=globalThis.fetch;
  const sources=[];
  class Context {
    state='suspended'; destination={};
    resume(){this.state='running';return Promise.resolve();}
    close(){return Promise.resolve();}
    decodeAudioData(data,resolve){resolve({duration:.5});}
    createBufferSource(){const s={connect(){},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};sources.push(s);return s;}
    createGain(){return {gain:{value:0},connect(){},disconnect(){}};}
  }
  let sound;
  try {
    globalThis.window={AudioContext:Context};
    globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
    sound=new CoachAudio();sound.prepare();await sound.loading;sound.unlock();
    sound.play({voice:'10',tone:'tone-tick'},.8);assert.equal(sources.length,2);
    sound.play({voice:'9'},.8);assert.ok(sources[0].stopped);assert.ok(sources[1].stopped);
    sound.play({stop:true});assert.ok(sources[2].stopped);
    const before=sources.length;
    const preview=sound.preview(.8,true);sound.stop();await preview;
    assert.equal(sources.length,before);
    sound.play({voice:'1'},0);assert.equal(sources.length,before);
  } finally {sound?.dispose();globalThis.window=oldWindow;globalThis.fetch=oldFetch;}
});
