import test from 'node:test';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import {parsePairQr,pairLink} from '../shared/pairing.mjs';
import {createHub} from '../server/hub.mjs';
const qrToken='ab'.repeat(32);
const url=pairLink('http://192.168.1.5:4174',{room:'012345abcd',code:'1234abcd',qrToken});
test('QR roundtrip decodes generated BareFit image into endpoint, room and code',()=>{
  const qr=QRCode.create(url,{errorCorrectionLevel:'M'}),scale=6,margin=4;
  const width=(qr.modules.size+margin*2)*scale;
  const data=new Uint8ClampedArray(width*width*4).fill(255);
  for(let y=0;y<qr.modules.size;y++)for(let x=0;x<qr.modules.size;x++)if(qr.modules.get(y,x))
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
      const i=(((y+margin)*scale+dy)*width+(x+margin)*scale+dx)*4;
      data[i]=data[i+1]=data[i+2]=0;
    }
  const result=jsQR(data,width,width);
  assert.equal(result.data,url);
  assert.deepEqual(parsePairQr(result.data),{base:'http://192.168.1.5:4174',room:'012345abcd',code:'1234abcd',qrToken,studioId:'1'});
});
test('rejects unrelated, executable, credential-bearing and malformed QR payloads',()=>{
  for(const value of ['hello','javascript:alert(1)','https://example.com',url.replace('http:','ftp:'),url.replace('192.168.1.5','user:password@192.168.1.5'),url.replace('/?','/admin?'),url.replace('1234abcd','wrong'),url.replace('012345abcd','short')])assert.throws(()=>parsePairQr(value));
  assert.throws(()=>parsePairQr(url.replace(qrToken,'wrong')));
});

test('older QR links retain the manual approval flow',()=>{
  assert.deepEqual(parsePairQr('http://192.168.1.5:4174/?mode=coach#room=012345abcd&code=1234abcd'),{base:'http://192.168.1.5:4174',room:'012345abcd',code:'1234abcd',studioId:'1'});
});
test('hub advertises configured LAN URL so localhost screens generate reachable QR codes',async()=>{
  const hub=await createHub({persist:false,studioUrls:['http://192.168.1.5:4174']});
  await new Promise(resolve=>hub.server.listen(0,'127.0.0.1',resolve));
  try {
    const response=await fetch(`http://127.0.0.1:${hub.server.address().port}/api/network`);
    assert.deepEqual(await response.json(),{urls:['http://192.168.1.5:4174']});
  }finally{await hub.close();}
});
