// Shared by the browser controller and installed phone app.
export const DEFAULT_SETTINGS = {volume:0.8,muted:false,voice:true,countdown:10,hall:true,clean:false};
export const SETTING_COMMANDS = {SET_VOLUME:'volume',SET_MUTE:'muted',SET_VOICE:'voice',SET_COUNTDOWN:'countdown',SET_HALL:'hall',SET_CLEAN:'clean'};
export function normalizeSettings(value) {
  const result={...DEFAULT_SETTINGS};
  for(const key of Object.keys(result)) {
    const v=value?.[key];
    if(key==='volume' ? Number.isFinite(v)&&v>=0&&v<=1 : key==='countdown' ? v===0||v===10 : typeof v==='boolean') result[key]=v;
  }
  return result;
}
// Wait for a live display before restoring phone preferences. Each reconnect
// gets one restore; stale cached state must never be mistaken for a live host.
export class SettingsSync {
  constructor(read,send) { this.read=read;this.send=send;this.reset(); }
  reset() { this.role='viewer';this.online=false;this.restored=false; }
  update(message) {
    if(message.type==='authenticated') { this.reset();this.role=message.role; }
    if(message.type==='role-update') { this.role=message.role;this.restored=false; }
    if(message.type==='host-status') { this.online=message.online;if(!this.online)this.restored=false; }
    if(this.role!=='controller'||!this.online||this.restored)return;
    this.restored=true;
    const saved=this.read();
    if(!saved)return;
    const settings=normalizeSettings(saved);
    for(const [command,key] of Object.entries(SETTING_COMMANDS)) this.send(command,settings[key]);
  }
}
