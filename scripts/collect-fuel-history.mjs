import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseSlavutaDiesel,recordFuelHistory} from '../worker/fuel.js';
const now=new Date();
// Scheduled runs can arrive late. Always record the actual Kyiv day of observation.
const path='data/fuel-history.json';
let history;
try{history=JSON.parse(await readFile(path,'utf8'))}catch(error){
  if(error.code!=='ENOENT')throw error;
  history={stationId:524,source:'https://upg.ua/merezha_azk/',days:[]};
}
let html;
if(process.env.UPG_HTML_PATH)html=await readFile(process.env.UPG_HTML_PATH,'utf8');
else{
  const response=await fetch('https://upg.ua/merezha_azk/',{headers:{Accept:'text/html'},redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('UPG unavailable: '+response.status);
  html=await response.text();
}
const data=parseSlavutaDiesel(html,now);
const next=recordFuelHistory(history,data,now);
await mkdir('data',{recursive:true});
await writeFile(path,JSON.stringify(next,null,2)+'\n');
console.log('Recorded '+data.fuels.length+' fuel prices for Slavuta.');
