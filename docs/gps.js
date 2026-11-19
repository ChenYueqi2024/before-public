import {parse} from './vendor/exifr-7.1.3.js';

const ascii=(bytes,start,length)=>String.fromCharCode(...bytes.slice(start,start+length));
export function imageKind(bytes) {
  if(bytes[0]===255&&bytes[1]===216)return 'jpeg';
  if(bytes.length>=8&&bytes[0]===137&&ascii(bytes,1,7)==='PNG\r\n\x1a\n')return 'png';
  if(ascii(bytes,0,4)==='RIFF'&&ascii(bytes,8,4)==='WEBP')return 'webp';
  return null;
}

// Walk bounded container segments; metadata payloads never become URLs or markup.
export function exifBlocks(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),kind=imageKind(bytes),blocks=[];
  const require=(condition)=>{if(!condition)throw new Error('Invalid image metadata container');};
  if(kind==='jpeg'){
    let offset=2,ended=false,hasScan=false,hasFrame=false;
    while(offset<bytes.length){
      if(bytes[offset++]!==255)continue;
      while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];
      if(marker===217){ended=true;break;}
      if(marker===0||marker===1||(marker>=208&&marker<=215))continue;
      require(offset+2<=bytes.length);const length=view.getUint16(offset);
      require(length>=2&&offset+length<=bytes.length);
      if(marker===225&&ascii(bytes,offset+2,6)==='Exif\0\0')blocks.push(bytes.slice(offset+8,offset+length));
      if(marker===218)hasScan=true;
      if(marker>=192&&marker<=207&&![196,200,204].includes(marker))hasFrame=true;
      offset+=length;
    }
    require(ended&&hasScan&&hasFrame);
  }else if(kind==='png'){
    let offset=8,ended=false,header=false,hasData=false;
    while(offset+12<=bytes.length){
      const size=view.getUint32(offset),type=ascii(bytes,offset+4,4);require(offset+12+size<=bytes.length);
      if(!header){require(type==='IHDR'&&size===13);header=true;}
      if(type==='eXIf')blocks.push(bytes.slice(offset+8,offset+8+size));
      if(type==='IDAT'&&size>0)hasData=true;
      offset+=12+size;if(type==='IEND'){require(size===0);ended=true;break;}
    }
    require(header&&hasData&&ended&&offset===bytes.length);
  }else if(kind==='webp'){
    require(bytes.length>=20&&view.getUint32(4,true)+8===bytes.length);
    let offset=12,expectsExif=false,hasImage=false;
    while(offset+8<=bytes.length){
      const type=ascii(bytes,offset,4),size=view.getUint32(offset+4,true);require(offset+8+size<=bytes.length);
      if(type==='VP8X'){require(size>=10);expectsExif=Boolean(bytes[offset+8]&8);}
      if((type==='VP8 '||type==='VP8L'||type==='ANMF')&&size>0)hasImage=true;
      if(type==='EXIF')blocks.push(bytes.slice(offset+8,offset+8+size));
      offset+=8+size+(size%2);
    }
    require(hasImage&&offset===bytes.length&&(!expectsExif||blocks.length>0));
  }else throw new Error('Unsupported image format');
  return blocks;
}

function hasGPSDirectory(bytes) {
  if(ascii(bytes,0,6)==='Exif\0\0')bytes=bytes.slice(6);
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),order=ascii(bytes,0,2),little=order==='II';
  if(bytes.length<8||!['II','MM'].includes(order)||view.getUint16(2,little)!==42)throw new Error('Invalid TIFF header');
  const u16=offset=>view.getUint16(offset,little),u32=offset=>view.getUint32(offset,little);
  const directory=offset=>{
    if(offset<8||offset+2>bytes.length)throw new Error('Invalid TIFF pointer');
    const count=u16(offset);if(offset+2+count*12+4>bytes.length)throw new Error('Truncated TIFF directory');
    return count;
  };
  const root=u32(4),count=directory(root);let present=false;
  for(let i=0;i<count;i++){
    const entry=root+2+i*12;
    if(u16(entry)===34853){
      if(u16(entry+2)!==4||u32(entry+4)!==1)throw new Error('Invalid GPS pointer type');
      const offset=u32(entry+8),tags=directory(offset);present ||= tags>0;
      for(let j=0;j<tags;j++){
        const item=offset+2+j*12,type=u16(item+2),amount=u32(item+4);
        const size=({1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8})[type];
        if(!size||amount>bytes.length)throw new Error('Invalid GPS value type');
        if(amount*size>4){const start=u32(item+8);if(start<8||start+amount*size>bytes.length)throw new Error('Truncated GPS value');}
      }
    }
  }
  return {present,bytes};
}

export async function inspectGPS(bytes) {
  let gps=false;
  for(const block of exifBlocks(bytes)){
    const data=hasGPSDirectory(block);
    await parse(data.bytes,{tiff:true,ifd0:false,ifd1:false,exif:false,gps:true,interop:false,xmp:false,icc:false,iptc:false,jfif:false,ihdr:false,
      mergeOutput:false,silentErrors:false,chunked:false,translateValues:false,reviveValues:false});
    gps ||= data.present;
  }
  return gps;
}
