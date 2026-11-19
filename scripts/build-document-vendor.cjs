const fs=require('fs'),path=require('path'),crypto=require('crypto'),browserify=require('browserify');
const root=path.join(__dirname,'..'),out=path.join(root,'docs/vendor/documents');fs.mkdirSync(out,{recursive:true});
const bundled=new Set();
const bundle=browserify(path.join(__dirname,'document-libs.cjs'),{standalone:'BeforePublicDocumentLibs'});
bundle.on('file',file=>{let dir=path.dirname(file);while(dir!==path.dirname(dir)){if(fs.existsSync(path.join(dir,'package.json'))){bundled.add(dir);break;}dir=path.dirname(dir);}});
bundle.bundle((error,bytes)=>{
  if(error)throw error;
  fs.writeFileSync(path.join(out,'word-xml.js'),'const vendorModule={exports:{}};\n(function(module,exports){\n'+bytes+'\n})(vendorModule,vendorModule.exports);\nexport default vendorModule.exports;\n');
  for(const [source,dest] of [['pdfjs-dist/legacy/build/pdf.mjs','pdf.js'],['pdfjs-dist/legacy/build/pdf.worker.mjs','pdf.worker.js'],['fflate/esm/browser.js','fflate.js']])fs.copyFileSync(path.join(root,'node_modules',source),path.join(out,dest));
  const assets={};
  for(const [folder,kind] of [['cmaps','cMapUrl'],['standard_fonts','standardFontDataUrl']]){
    const dir=path.join(root,'node_modules/pdfjs-dist',folder);assets[kind]={};
    for(const name of fs.readdirSync(dir).sort())if(!name.toLowerCase().includes('license'))assets[kind][name]=fs.readFileSync(path.join(dir,name)).toString('base64');
  }
  fs.writeFileSync(path.join(out,'pdf-assets.js'),'export const assets='+JSON.stringify(assets)+';\n');
  for(const name of ['pdfjs-dist','fflate'])bundled.add(path.join(root,'node_modules',name));
  let licenses='Bundled document parsers and their runtime dependencies. Built with scripts/build-document-vendor.cjs; locked by package-lock.json.\n';
  for(const dir of [...bundled].sort()){
    const meta=JSON.parse(fs.readFileSync(path.join(dir,'package.json')));if(meta.private)continue;
    licenses+='\n===== '+meta.name+' '+meta.version+' ('+meta.license+') =====\n';
    for(const file of fs.readdirSync(dir).filter(name=>/^licen[cs]e/i.test(name)&&fs.statSync(path.join(dir,name)).isFile()))licenses+=fs.readFileSync(path.join(dir,file),'utf8')+'\n';
    if(meta.name==='pdfjs-dist')for(const folder of ['cmaps','standard_fonts'])for(const file of fs.readdirSync(path.join(dir,folder)).filter(name=>/license/i.test(name)))licenses+=fs.readFileSync(path.join(dir,folder,file),'utf8')+'\n';
  }
  fs.writeFileSync(path.join(out,'LICENSES.txt'),licenses);
  const hashes={};for(const name of fs.readdirSync(out).sort())if(name!=='SHA256.json')hashes[name]=crypto.createHash('sha256').update(fs.readFileSync(path.join(out,name))).digest('hex');
  fs.writeFileSync(path.join(out,'SHA256.json'),JSON.stringify(hashes,null,2)+'\n');
  console.log('Document libraries, offline font/CMap data and licenses built.');
});
