#!/usr/bin/env node
// MineGuard serial dependency gate: validate | next | check ID | start ID OWNER | complete ID OWNER EVIDENCE
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const manifest=read('tasks/manifest.json'), status=read('tasks/status.json');
const [command,id,actor,evidence]=process.argv.slice(2);
const ensure=(test,msg)=>{if(!test)throw Error(msg);};
const allowedPath=p=>typeof p==='string'&&!path.isAbsolute(p)&&!p.split('/').includes('..')&&fs.existsSync(path.join(root,p));
function blocked(tid){
 const task=manifest.tasks[tid];ensure(task,'Unknown task '+tid);
 for(const dep of task.dependsOn){if(status.tasks[dep].state!=='DONE')return 'BLOCKED: '+tid+' requires '+dep+' ('+manifest.tasks[dep].owner+'). Ask '+manifest.tasks[dep].owner+' to complete and commit '+dep+' before beginning '+tid+'.';}
 const current=manifest.order.find(t=>t!==tid&&status.tasks[t].state==='IN_PROGRESS');
 return current?'BLOCKED: '+tid+'; '+current+' ('+manifest.tasks[current].owner+') is IN_PROGRESS.':null;
}
function validate(){
 ensure(manifest.schemaVersion===1&&status.schemaVersion===1,'Invalid schema');
 ensure(manifest.order.length>0&&new Set(manifest.order).size===manifest.order.length,'Bad manifest order');
 ensure(Object.keys(manifest.tasks).length===manifest.order.length&&Object.keys(status.tasks).length===manifest.order.length,'Task count mismatch');
 let active=0;
 for(let i=0;i<manifest.order.length;i++){
  const tid=manifest.order[i],task=manifest.tasks[tid],s=status.tasks[tid];
  ensure(task&&s,'Missing task '+tid);
  ensure(task.owner===s.owner&&['Rahil','Shabaz'].includes(task.owner),'Owner mismatch '+tid);
  ensure(['BUILD','DOC'].includes(task.kind)&&['TODO','IN_PROGRESS','DONE'].includes(s.state),'Bad task kind/state '+tid);
  ensure(i===0?task.dependsOn.length===0:(task.dependsOn.length===1&&task.dependsOn[0]===manifest.order[i-1]),'Broken serial dependency '+tid);
  if(s.state!=='TODO') for(const dep of task.dependsOn) ensure(status.tasks[dep].state==='DONE',blocked(tid)||'Dependency not DONE');
  if(s.state==='TODO')ensure(s.evidence===null,'TODO contains evidence '+tid);
  if(s.state==='IN_PROGRESS'){active++;ensure(s.startedBy===task.owner,'Wrong starter '+tid);}
  if(s.state==='DONE'){
   ensure(allowedPath(s.evidence),'DONE missing evidence '+tid+' at '+s.evidence);
   ensure(s.evidence===task.evidence,'Wrong evidence path for '+tid);
   if(task.kind==='BUILD'){
    const body=fs.readFileSync(path.join(root,s.evidence),'utf8');
    ensure(body.includes('Task: '+tid)&&body.includes('Owner: '+task.owner)&&body.includes('Tester: ')&&body.includes('Result: PASS'),'Missing truthful build QA record '+tid);
   }
  }
 }
 ensure(active<=1,'More than one IN_PROGRESS task');
}
function save(){fs.writeFileSync(path.join(root,'tasks/status.json'),JSON.stringify(status,null,2)+'\n');}
try{
 validate();
 if(command==='validate') console.log('PASS: task manifest, chain, owner, status and evidence valid.');
 else if(command==='next'){
  const tid=manifest.order.find(t=>status.tasks[t].state!=='DONE');
  if(!tid)console.log('ALL TASKS DONE');
  else console.log(tid+' ['+manifest.tasks[tid].owner+'] '+status.tasks[tid].state+': '+(blocked(tid)||'READY'));
 }else if(command==='check'){
  ensure(id,'Need task ID');
  const msg=status.tasks[id]?.state==='DONE'?'DONE: '+id:blocked(id)||'READY: '+id+' ('+manifest.tasks[id].owner+')';
  if(msg.startsWith('BLOCKED'))throw Error(msg); console.log(msg);
 }else if(command==='start'){
  ensure(id&&actor,'Usage: start MG-XXX Rahil|Shabaz');
  const t=manifest.tasks[id],s=status.tasks[id];ensure(t&&s,'Unknown task '+id);
  ensure(t.owner===actor,'BLOCKED: task owner is '+t.owner);
  ensure(s.state==='TODO','BLOCKED: task not TODO');
  const reason=blocked(id);ensure(!reason,reason);
  s.state='IN_PROGRESS';s.startedBy=actor;
  save();validate();console.log('STARTED: '+id+'; commit/push before work');
 }else if(command==='complete'){
  ensure(id&&actor&&evidence,'Usage: complete MG-XXX OWNER evidence/path.md');
  const t=manifest.tasks[id],s=status.tasks[id];ensure(t&&s,'Unknown task '+id);
  ensure(t.owner===actor&&s.state==='IN_PROGRESS'&&s.startedBy===actor,'BLOCKED: task not started by owner');
  const reason=blocked(id);ensure(!reason,reason);
  ensure(allowedPath(evidence),'Missing evidence '+evidence);
  s.state='DONE';s.evidence=evidence;s.completedBy=actor;
  save();validate();console.log('DONE: '+id+'; commit/push code, evidence and status');
 }else throw Error('Usage: validate | next | check ID | start ID OWNER | complete ID OWNER EVIDENCE');
}catch(err){console.error(err.message);process.exitCode=1;}
