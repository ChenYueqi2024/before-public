const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=path.join(__dirname,'..'),out=path.join(root,'docs/vendor/ocr');fs.mkdirSync(path.join(out,'lang'),{recursive:true});
const copy=(src,dest)=>fs.copyFileSync(path.join(root,'node_modules',src),path.join(out,dest));
const api=fs.readFileSync(path.join(root,'node_modules/tesseract.js/dist/tesseract.min.js'),'utf8').replace(/\/\/# sourceMappingURL=.*$/gm,'');
fs.writeFileSync(path.join(out,'tesseract.js'),'const vendorModule={exports:{}};(function(module,exports){\n'+api+'\n})(vendorModule,vendorModule.exports);export default vendorModule.exports;\n');
copy('tesseract.js/dist/worker.min.js','worker.min.js');
for(const name of ['tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js'])copy('tesseract.js-core/'+name,name);
for(const lang of ['eng','chi_sim'])copy('@tesseract.js-data/'+lang+'/4.0.0_best_int/'+lang+'.traineddata.gz','lang/'+lang+'.traineddata.gz');
let licenses='Tesseract.js 6.0.1; tesseract.js-core 6.1.2; eng/chi_sim data 1.0.0 (4.0.0_best_int). Apache-2.0.\nSources: https://github.com/naptha/tesseract.js https://github.com/naptha/tesseract.js-core https://github.com/naptha/tessdata https://github.com/tesseract-ocr/tessdata_best\n';
for(const pkg of ['tesseract.js','tesseract.js-core','bmp-js','idb-keyval','regenerator-runtime','wasm-feature-detect','zlibjs']){
  const dir=path.join(root,'node_modules',pkg);licenses+='\n===== '+pkg+' =====\n';
  for(const name of fs.readdirSync(dir).filter(name=>/^licen[cs]e/i.test(name)&&fs.statSync(path.join(dir,name)).isFile()))licenses+=fs.readFileSync(path.join(dir,name),'utf8')+'\n';
}
fs.writeFileSync(path.join(out,'LICENSES.txt'),licenses);
const hashes={};for(const dir of [out,path.join(out,'lang')])for(const name of fs.readdirSync(dir).sort()){const file=path.join(dir,name);if(fs.statSync(file).isFile()&&name!=='SHA256.json')hashes[path.relative(out,file).replaceAll('\\','/')]=crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
fs.writeFileSync(path.join(out,'SHA256.json'),JSON.stringify(hashes,null,2)+'\n');
fs.writeFileSync(path.join(root,'docs/sensitive-rules.js'),'// Generated from sensitive-rules.json.\nexport const patterns='+fs.readFileSync(path.join(root,'sensitive-rules.json'),'utf8')+';\n');
console.log('Local OCR engine, Chinese/English models, licenses and shared rules built.');
