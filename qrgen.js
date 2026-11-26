// qrgen — QR code generator (byte mode, ECC M or L, versions 1-40). Returns {size, get(x,y)} or null if too long.
// Written for The Holdover's range card sharing; follows the QR Model 2 spec (ISO/IEC 18004).
function qrgen(bytes){
  const ECC={M:{bits:0,cw:[-1,10,16,26,18,24,16,18,22,22,26,30,22,22,24,24,28,28,26,26,26,26,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28,28],
               nb:[-1,1,1,1,2,2,4,4,4,5,5,5,8,9,9,10,10,11,13,14,16,17,17,18,20,21,23,25,26,28,29,31,33,35,37,38,40,43,45,47,49]},
             L:{bits:1,cw:[-1,7,10,15,20,26,18,20,24,30,18,20,24,26,30,22,24,28,30,28,28,28,28,30,30,26,28,30,30,30,30,30,30,30,30,30,30,30,30,30,30],
               nb:[-1,1,1,1,1,1,2,2,2,2,4,4,4,4,4,6,6,6,6,7,8,8,9,9,10,12,12,12,13,14,15,16,17,18,19,19,20,21,22,24,25]}};
  const rawMods=v=>{let r=(16*v+128)*v+64;if(v>=2){const n=Math.floor(v/7)+2;r-=(25*n-10)*n-55;if(v>=7)r-=36}return r};
  const dataCw=(v,e)=>Math.floor(rawMods(v)/8)-e.cw[v]*e.nb[v];
  // pick the smallest version: ECC M first, L if M can't hold it
  let ver=0,ecl=null;
  for(const k of['M','L']){const e=ECC[k];
    for(let v=1;v<=40;v++){const cap=dataCw(v,e)*8,need=4+(v<=9?8:16)+bytes.length*8;if(need<=cap){ver=v;ecl=e;break}}
    if(ver)break}
  if(!ver)return null;
  // ---- data bits
  const bits=[];const put=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>>i)&1)};
  put(4,4);put(bytes.length,ver<=9?8:16);for(const b of bytes)put(b,8);
  const cap=dataCw(ver,ecl)*8;
  put(0,Math.min(4,cap-bits.length));put(0,(8-bits.length%8)%8);
  for(let p=0xEC;bits.length<cap;p^=0xEC^0x11)put(p,8);
  const data=[];for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];data.push(b)}
  // ---- Reed-Solomon
  const mul=(x,y)=>{let z=0;for(let i=7;i>=0;i--){z=(z<<1)^((z>>>7)*0x11D);z^=((y>>>i)&1)*x}return z&0xFF};
  const divisor=deg=>{const r=new Array(deg).fill(0);r[deg-1]=1;let root=1;
    for(let i=0;i<deg;i++){for(let j=0;j<deg;j++){r[j]=mul(r[j],root);if(j+1<deg)r[j]^=r[j+1]}root=mul(root,2)}return r};
  const rem=(d,dv)=>{const r=new Array(dv.length).fill(0);
    for(const b of d){const f=b^r.shift();r.push(0);dv.forEach((c,i)=>r[i]^=mul(c,f))}return r};
  const nb=ecl.nb[ver],ecLen=ecl.cw[ver],raw=Math.floor(rawMods(ver)/8),nShort=nb-raw%nb,shortLen=Math.floor(raw/nb);
  const dv=divisor(ecLen),blocks=[];
  for(let i=0,k=0;i<nb;i++){const len=shortLen-ecLen+(i<nShort?0:1);const dat=data.slice(k,k+len);k+=len;
    const ec=rem(dat,dv);if(i<nShort)dat.push(0);blocks.push(dat.concat(ec))}
  const cws=[];for(let i=0;i<blocks[0].length;i++)for(let j=0;j<nb;j++)if(i!==shortLen-ecLen||j>=nShort)cws.push(blocks[j][i]);
  // ---- function patterns
  const size=ver*4+17;
  const M=Array.from({length:size},()=>new Array(size).fill(false)),F=Array.from({length:size},()=>new Array(size).fill(false));
  const set=(x,y,d)=>{M[y][x]=d;F[y][x]=true};
  for(let i=0;i<size;i++){set(6,i,i%2===0);set(i,6,i%2===0)}
  const finder=(cx,cy)=>{for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const d=Math.max(Math.abs(dx),Math.abs(dy)),x=cx+dx,y=cy+dy;
    if(x>=0&&x<size&&y>=0&&y<size)set(x,y,d!==2&&d!==4)}};
  finder(3,3);finder(size-4,3);finder(3,size-4);
  const al=[];if(ver>1){const n=Math.floor(ver/7)+2,step=ver===32?26:Math.ceil((ver*4+4)/(n*2-2))*2;al.push(6);
    for(let p=size-7;al.length<n;p-=step)al.splice(1,0,p)}
  for(let i=0;i<al.length;i++)for(let j=0;j<al.length;j++){
    if((i===0&&j===0)||(i===0&&j===al.length-1)||(i===al.length-1&&j===0))continue;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)set(al[i]+dx,al[j]+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1)}
  const fmt=mask=>{const d=ecl.bits<<3|mask;let r=d;for(let i=0;i<10;i++)r=(r<<1)^((r>>>9)*0x537);const b=((d<<10)|r)^0x5412,g=i=>((b>>>i)&1)===1;
    for(let i=0;i<=5;i++)set(8,i,g(i));set(8,7,g(6));set(8,8,g(7));set(7,8,g(8));for(let i=9;i<15;i++)set(14-i,8,g(i));
    for(let i=0;i<8;i++)set(size-1-i,8,g(i));for(let i=8;i<15;i++)set(8,size-15+i,g(i));set(8,size-8,true)};
  fmt(0);
  if(ver>=7){let r=ver;for(let i=0;i<12;i++)r=(r<<1)^((r>>>11)*0x1F25);const b=ver<<12|r;
    for(let i=0;i<18;i++){const bit=((b>>>i)&1)===1,a=size-11+i%3,c=Math.floor(i/3);set(a,c,bit);set(c,a,bit)}}
  // ---- data, zigzag from the bottom right
  let k=0;
  for(let right=size-1;right>=1;right-=2){if(right===6)right=5;
    for(let v=0;v<size;v++)for(let j=0;j<2;j++){const x=right-j,up=((right+1)&2)===0,y=up?size-1-v:v;
      if(!F[y][x]&&k<cws.length*8){M[y][x]=((cws[k>>>3]>>>(7-(k&7)))&1)===1;k++}}}
  // ---- mask: try all 8, keep the lowest penalty
  const maskFn=[(x,y)=>(x+y)%2===0,(x,y)=>y%2===0,(x,y)=>x%3===0,(x,y)=>(x+y)%3===0,(x,y)=>(Math.floor(x/3)+Math.floor(y/2))%2===0,
    (x,y)=>x*y%2+x*y%3===0,(x,y)=>(x*y%2+x*y%3)%2===0,(x,y)=>((x+y)%2+x*y%3)%2===0];
  const apply=m=>{for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(!F[y][x]&&maskFn[m](x,y))M[y][x]=!M[y][x]};
  const penalty=()=>{let p=0,dark=0;
    for(let a=0;a<2;a++)for(let i=0;i<size;i++){let run=1;for(let j=1;j<size;j++){const c=a?M[j][i]:M[i][j],pr=a?M[j-1][i]:M[i][j-1];
      if(c===pr){run++;if(run===5)p+=3;else if(run>5)p++}else run=1}}
    for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){const c=M[y][x];if(c===M[y][x+1]&&c===M[y+1][x]&&c===M[y+1][x+1])p+=3}
    const pat=[1,0,1,1,1,0,1];
    for(let a=0;a<2;a++)for(let i=0;i<size;i++)for(let j=0;j+6<size;j++){let ok=true;for(let q=0;q<7;q++){if((a?M[j+q][i]:M[i][j+q])!==!!pat[q]){ok=false;break}}
      if(ok){const lit=(o)=>{for(let q=1;q<=4;q++){const t=j+o*q;if(t<0||t>=size)continue;if(a?M[t][i]:M[i][t])return false}return true};
        if(j+7<=size&&(lit(-1)||lit(7)?true:false))p+=40}}
    for(let y=0;y<size;y++)for(let x=0;x<size;x++)if(M[y][x])dark++;
    p+=Math.floor(Math.abs(dark*20-size*size*10)/(size*size))*10;return p};
  let best=0,bestP=Infinity;
  for(let m=0;m<8;m++){apply(m);fmt(m);const p=penalty();if(p<bestP){bestP=p;best=m}apply(m)}
  apply(best);fmt(best);
  return{size,version:ver,get:(x,y)=>x>=0&&y>=0&&x<size&&y<size&&M[y][x]};
}
if(typeof module!=='undefined')module.exports=qrgen;
