import test from 'node:test';
import assert from 'node:assert/strict';
import {SettingsSync,normalizeSettings,DEFAULT_SETTINGS} from '../shared/settings.mjs';

test('phone preferences wait for a live host and restore once per reconnect',()=>{
  const sent=[];
  const sync=new SettingsSync(()=>({...DEFAULT_SETTINGS,volume:0.3,hall:false}),(command,payload)=>sent.push({command,payload}));
  sync.update({type:'authenticated',role:'controller'});
  sync.update({type:'state',state:{studioSettings:DEFAULT_SETTINGS}});
  sync.update({type:'host-status',online:false});
  assert.equal(sent.length,0);
  sync.update({type:'host-status',online:true});
  assert.equal(sent.length,6);
  assert.deepEqual(sent[0],{command:'SET_VOLUME',payload:0.3});
  sync.update({type:'host-status',online:true});assert.equal(sent.length,6);
  sync.update({type:'host-status',online:false});
  sync.update({type:'host-status',online:true});assert.equal(sent.length,12);
  sync.update({type:'role-update',role:'viewer'});
  sync.update({type:'host-status',online:false});sync.update({type:'host-status',online:true});
  assert.equal(sent.length,12);
  sync.update({type:'role-update',role:'controller'});assert.equal(sent.length,18);
});
test('invalid stored preferences cannot emit malformed settings',()=>{
  assert.deepEqual(normalizeSettings({volume:-1,voice:'false',countdown:7,hall:null}),DEFAULT_SETTINGS);
  const sent=[];const sync=new SettingsSync(()=>null,(...args)=>sent.push(args));
  sync.update({type:'authenticated',role:'controller'});sync.update({type:'host-status',online:true});
  assert.equal(sent.length,0);
});
