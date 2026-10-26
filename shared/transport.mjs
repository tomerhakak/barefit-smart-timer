export const MAX_BUFFERED_BYTES=256*1024;
// Never accumulate an unbounded queue of stale timer frames on a slow link.
export function sendMessage(socket,message) {
  if(socket?.readyState!==1)return false;
  try {
    if(socket.bufferedAmount>MAX_BUFFERED_BYTES){
      socket.close(4002,'Slow connection');
      return false;
    }
    socket.send(JSON.stringify(message));
    return true;
  } catch { return false; }
}
