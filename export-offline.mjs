import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(project, 'outputs');
const assets = [
  'gravel_stones_diff_2k.jpg',
  'gravel_stones_nor_gl_2k.jpg',
  'gravel_stones_rough_2k.jpg',
];
let script = fs.readFileSync(path.join(publicDir, 'app.js'), 'utf8');
for (const name of assets) {
  const reference = `./assets/${name}`;
  if (script.split(reference).length !== 2) {
    throw new Error(`Expected exactly one texture reference: ${name}`);
  }
  const data = fs.readFileSync(path.join(publicDir, 'assets', name)).toString('base64');
  script = script.replace(reference, `data:image/jpeg;base64,${data}`);
}
script = script.replace(/<\/script/gi, '<\\/script');
let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const externalScript = '<script src="./app.js" defer></script>';
if (html.split(externalScript).length !== 2) throw new Error('Missing unique application script tag.');
const models=JSON.parse(fs.readFileSync(path.join(publicDir,'assets','models','metadata.json'),'utf8'));
const destination = path.join(publicDir, '打开月面漫游.html');
const [prefix,suffix]=html.split(externalScript),output=fs.openSync(destination,'w');
try{
  fs.writeSync(output,prefix);
  for(const {id} of models){
    const data=fs.readFileSync(path.join(publicDir,'assets','models',id+'.glb')).toString('base64');
    fs.writeSync(output,`<script type="application/octet-stream" id="embedded-model-${id}">${data}</script>\n`);
  }
  for(const name of ['draco_wasm_wrapper.js','draco_decoder.wasm','draco_decoder.js']){
    const data=fs.readFileSync(path.join(publicDir,'assets','draco',name)).toString('base64');
    fs.writeSync(output,`<script type="application/octet-stream" id="embedded-decoder-${name}">${data}</script>\n`);
  }
  fs.writeSync(output,`<script>\n${script}\n</script>${suffix}`);
}finally{fs.closeSync(output);}
console.log(`Offline page: ${destination}`);
