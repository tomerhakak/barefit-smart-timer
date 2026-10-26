import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/assets/coach/', import.meta.url));
const rate = 22050;
function wav(samples, sampleRate = rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sampleRate, 24); b.writeUInt32LE(sampleRate * 2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36);
  b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return b;
}
const manifest = {};
for (const id of ['10','9','8','7','6','5','4','3','2','1','work','rest','prepare','between','last','last-set','finish']) {
  const b = readFileSync(root + id + '.wav');
  let offset = 12, data, hz, channels, bits;
  while (offset + 8 <= b.length) {
    const kind = b.toString('ascii', offset, offset + 4), length = b.readUInt32LE(offset + 4);
    if (kind === 'fmt ') { channels = b.readUInt16LE(offset+10); hz = b.readUInt32LE(offset+12); bits = b.readUInt16LE(offset+22); }
    if (kind === 'data') data = b.subarray(offset+8, offset+8+length);
    offset += 8 + length + (length % 2);
  }
  if (!data || bits !== 16 || channels !== 1) throw Error('Expected mono PCM16');
  let samples = Array.from({length:data.length/2},(_,i)=>data.readInt16LE(i*2)/32768);
  // Keep low-energy Hebrew sibilants (the opening/ending shin in shesh and shalosh).
  const first = samples.findIndex(s=>Math.abs(s)>0.0015);
  let end = samples.length-1; while(end>first && Math.abs(samples[end])<0.0015) end--;
  samples = samples.slice(Math.max(0,first-Math.round(hz*.06)), Math.min(samples.length,end+Math.round(hz*.07)));
  const peak = samples.reduce((m,s)=>Math.max(m,Math.abs(s)),0);
  samples = samples.map(s=>s * .86 / (peak || 1));
  // Keep every spoken number within one timer second, with room for device latency.
  if (/^\d+$/.test(id) && samples.length/hz > .92) {
    const length = Math.floor(hz*.92), ratio = samples.length/length;
    samples = Array.from({length}, (_,i)=>samples[Math.floor(i*ratio)]);
  }
  writeFileSync(root+id+'.wav',wav(samples,hz));
  manifest[id] = +(samples.length/hz).toFixed(3);
}
function tone(id, duration, notes) {
  const samples = Array.from({length:Math.ceil(duration*rate)},(_,i)=> {
    const t=i/rate;
    return notes.reduce((sum,[start,freq,length,gain])=>{
      const a=t-start;
      if(a<0||a>length)return sum;
      const env=Math.min(1,a/.008)*Math.exp(-a*7/length);
      return sum+gain*env*(Math.sin(2*Math.PI*freq*a)+.18*Math.sin(2*Math.PI*freq*2.76*a));
    },0);
  });
  writeFileSync(root+id+'.wav',wav(samples)); manifest[id]=duration;
}
tone('tone-work', .5, [[0,880,.34,.6],[.15,1174,.3,.5]]);
tone('tone-rest', .5, [[0,660,.32,.6],[.18,440,.3,.55]]);
tone('tone-prepare', .25, [[0,740,.22,.55]]);
tone('tone-tick', .12, [[0,950,.1,.35]]);
tone('tone-finish', .85, [[0,659,.4,.5],[.18,880,.4,.5],[.36,1318,.47,.55]]);
writeFileSync(root+'manifest.json',JSON.stringify({voice:'Microsoft Asaf, he-IL; synthetic, rate +2; shesh/shalosh pointed and rate 0; sibilant-preserving trim',durations:manifest},null,2));
console.log(manifest);
