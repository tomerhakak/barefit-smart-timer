import test from 'node:test';
import assert from 'node:assert/strict';
import {sendMessage,MAX_BUFFERED_BYTES} from '../shared/transport.mjs';
test('slow network cannot accumulate unbounded state frames or commands',()=>{
  let queued=0,closed=0;
  const socket={readyState:1,bufferedAmount:MAX_BUFFERED_BYTES+1,send(){queued++},close(code){assert.equal(code,4002);closed++;this.readyState=2;}};
  for(let i=0;i<100000;i++)assert.equal(sendMessage(socket,{type:'state',state:{remaining:i}}),false);
  assert.equal(queued,0);assert.equal(closed,1);
});
test('normal messages succeed; closed or failing sockets do not crash the timer loop',()=>{
  let frame;
  const socket={readyState:1,bufferedAmount:0,send(value){frame=JSON.parse(value)}};
  assert.equal(sendMessage(socket,{type:'command',id:'one'}),true);assert.equal(frame.id,'one');
  socket.send=()=>{throw Error('network went away')};
  assert.equal(sendMessage(socket,{type:'state'}),false);
  assert.equal(sendMessage(null,{type:'state'}),false);
});
