import test from 'node:test';
import assert from 'node:assert/strict';
import {createHub} from '../server/hub.mjs';
import {Connection,request} from '../shared/connection.mjs';
import {WorkoutEngine,PRESETS} from '../shared/engine.mjs';
import {MAX_BUFFERED_BYTES} from '../shared/transport.mjs';

const until=async(predicate)=>{
  const limit=Date.now()+4000;
  while(!predicate()){
    if(Date.now()>limit)throw Error('Reconnect deadline exceeded');
    await new Promise(resolve=>setTimeout(resolve,20));
  }
};
test('eight actual host/phone reconnects preserve an eight-hour simulated workout',async(t)=>{
  const hub=await createHub({persist:false});
  await new Promise(resolve=>hub.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${hub.server.address().port}`;
  let host,phone,ticker,hostAuth=0,phoneAuth=0,acks=0,lastState;
  t.after(async()=>{clearInterval(ticker);host?.close();phone?.close();await hub.close();});
  let clock=0;
  const engine=new WorkoutEngine({...PRESETS[0],work:7200,rounds:12,sets:1,rest:0,between:0,prepare:0},()=>clock);
  engine.start();
  const credentials=await request(base,'/api/rooms',{});
  host=new Connection(base,{...credentials,role:'host',studioId:'1'},m=>{
    if(m.type==='authenticated'){hostAuth++;host.send({type:'state',state:engine.view()});}
    if(m.type==='command'){
      assert.equal(m.command,'GET_STATUS');
      host.send({type:'state',state:engine.view()});host.send({type:'ack',id:m.id,ok:true});
    }
  });
  await until(()=>hostAuth===1);
  const coach=await request(base,'/api/connect-studio',{studioId:'1',name:'Endurance coach'});
  phone=new Connection(base,{...coach,role:'coach'},m=>{
    if(m.type==='authenticated')phoneAuth++;
    if(m.type==='state')lastState=m.state;
    if(m.type==='ack'){assert.equal(m.ok,true);acks++;}
  });
  ticker=setInterval(()=>host.send({type:'state',state:engine.view()}),100);
  await until(()=>phoneAuth===1&&lastState);
  for(let i=1;i<=8;i++){
    clock+=3600000;
    phone.ws.close(4000,'Test network loss');
    if(i===1){
      Object.defineProperty(host.ws,'bufferedAmount',{value:MAX_BUFFERED_BYTES+1});
      assert.equal(host.send({type:'state',state:engine.view()}),false);
      assert.equal(host.ws.readyState,2);
    }else host.ws.close(4000,'Test network loss');
    assert.equal(engine.view().status,'running');
    await until(()=>phoneAuth===i+1&&hostAuth===i+1&&lastState?.totalRemaining===86400000-clock);
    assert.equal(phone.send({type:'command',id:`check-${i}`,sequence:i,command:'GET_STATUS'}),true);
    await until(()=>acks===i);
  }
  assert.equal(engine.view().totalRemaining,43200000+14400000);
  assert.equal(hub.rooms.size,1);assert.equal(hub.rooms.get(credentials.room).devices.length,1);
  assert.equal(hub.rooms.get(credentials.room).inflight.size,0);
});
