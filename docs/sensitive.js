import {patterns} from './sensitive-rules.js';
export function normalizedText(text,ocr=false){
  text=text.normalize('NFKC');
  if(ocr)text=text.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g,'');
  return text;
}
export function detectSensitive(text,ocr=false){
  const normal=normalizedText(text,ocr),variants=ocr?[normal,normal.replace(/[ \t]/g,'')]:[normal];
  const labels=new Set();
  for(const {label,pattern,flags} of patterns)for(const variant of variants)if(new RegExp(pattern,flags).test(variant)){labels.add(label);break;}
  return [...labels];
}
