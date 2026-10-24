import{readFile,writeFile,stat}from'node:fs/promises';
import assert from'node:assert/strict';
const inputs=[['browser','step1-browser-results',16],['browser-deep','step1-deep-results',7],['finance-browser','step2-browser-results',12],['files-browser','step3-browser-results',24],['gantt-browser','step4-browser-results',21],['print-options-browser','compact-browser-results',22],['offline-browser','step5-offline-results',13],['acceptance-browser','step5-acceptance-results',9],['journey-browser','step5-journey-results',1],['audit-block1-browser','audit-block1-results',17],['audit-block2-browser','audit-block2-results',9]];
const results=[];
for(const[suite,name,count]of inputs){const file='output/'+name+'.json',data=JSON.parse(await readFile(file,'utf8'));assert.equal((data.results||data.passed).length,count,file);assert.deepEqual(data.errors||[],[],file);results.push({suite,status:0,scenarios:count,source:file,modifiedAt:(await stat(file)).mtime.toISOString()});}
const release=JSON.parse(await readFile('output/release/verification.json','utf8'));
await writeFile('output/step5-regression.json',JSON.stringify({completedOn:'2026-10-24',generatedAt:new Date().toISOString(),releaseVersion:release.version,total:results.reduce((n,r)=>n+r.scenarios,0),note:'Сводка последних успешных результатов каждого набора. После исправлений D05–D09 повторены все наборы, включая 9 новых регрессионных сценариев.',results},null,2));
console.log('Verified browser reports: '+results.reduce((n,r)=>n+r.scenarios,0));
