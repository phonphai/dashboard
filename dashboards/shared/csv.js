// ฟังก์ชันอ่าน CSV ที่ทุก dashboard ใช้ร่วมกัน (โหลดด้วย <script src="shared/csv.js">)
'use strict';
const TH_MONTHS={'มกราคม':'ม.ค.','กุมภาพันธ์':'ก.พ.','มีนาคม':'มี.ค.','เมษายน':'เม.ย.','พฤษภาคม':'พ.ค.','มิถุนายน':'มิ.ย.','กรกฎาคม':'ก.ค.','สิงหาคม':'ส.ค.','กันยายน':'ก.ย.','ตุลาคม':'ต.ค.','พฤศจิกายน':'พ.ย.','ธันวาคม':'ธ.ค.'};

// Text -> array of rows (array of cells). Handles quoted cells, "" escapes and CRLF.
function parseCSV(text){
  text=text.replace(/^﻿/,'');
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){ if(c==='"'){ if(text[i+1]==='"'){cell+='"';i++;} else quoted=false; } else cell+=c; }
    else if(c==='"') quoted=true;
    else if(c===','){row.push(cell);cell='';}
    else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';}
    else if(c!=='\r') cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows;
}

// "1,234" -> 1234; "", "null", "-", "n/a" -> null.
const toNum=v=>{const t=String(v??'').trim().replace(/,/g,'');if(!t||/^(null|none|-|n\/a)$/i.test(t))return null;const n=Number(t);return Number.isFinite(n)?n:null;};

// Rows -> {cols, records, before}. The header is the first row whose first cell is `firstCol`,
// or (without firstCol) the first row with the most filled cells. `before` = report title rows above it.
function splitHeader(rows,firstCol){
  const filled=r=>r.filter(c=>String(c).trim()).length;
  const max=Math.max(0,...rows.map(filled));
  const head=firstCol?rows.findIndex(r=>String(r[0]).trim()===firstCol):rows.findIndex(r=>filled(r)===max);
  if(head<0) return null;
  const cols=rows[head].map(c=>String(c).trim());
  const records=rows.slice(head+1).filter(r=>filled(r)).map(r=>Object.fromEntries(cols.map((c,i)=>[c,String(r[i]??'').trim()])));
  return {cols,records,before:rows.slice(0,head)};
}

const MONTH_NAMES=Object.keys(TH_MONTHS);
const cmpDate=(a,b)=>a.y-b.y||a.m-b.m||a.d-b.d;
// "ข้อมูลตั้งแต่วันที่ 1 ตุลาคม 2569 ถึงวันที่ 15 ตุลาคม 2569" -> {start,end}, or null if the line has another format.
function parseRange(line){
  const m=line.match(/(\d{1,2})\s*(\S+)\s*(\d{4})\s*ถึง(?:วันที่)?\s*(\d{1,2})\s*(\S+)\s*(\d{4})/);
  if(!m||!TH_MONTHS[m[2]]||!TH_MONTHS[m[5]]) return null;
  return {start:{d:+m[1],m:MONTH_NAMES.indexOf(m[2]),y:+m[3]},end:{d:+m[4],m:MONTH_NAMES.indexOf(m[5]),y:+m[6]}};
}
// Several files: show one range from the earliest start to the latest end.
function mergePeriods(lines){
  const ranges=lines.map(parseRange);
  if(!lines.length||ranges.some(r=>!r)){
    const raw=[...new Set(lines.map(l=>l.replace(/^ข้อมูล(ตั้งแต่)?(วันที่)?/,'').trim()).filter(Boolean))].join(' / ')||'-';
    return {full:raw,short:raw};
  }
  const start=ranges.map(r=>r.start).sort(cmpDate)[0],end=ranges.map(r=>r.end).sort(cmpDate).pop();
  const sameYear=start.y===end.y,month=i=>MONTH_NAMES[i];
  return {full:`${start.d} ${month(start.m)}${sameYear?'':' '+start.y} – ${end.d} ${month(end.m)} พ.ศ. ${end.y}`,
          short:`${start.d} ${TH_MONTHS[month(start.m)]}${sameYear?'':' '+start.y} – ${end.d} ${TH_MONTHS[month(end.m)]} ${end.y}`};
}

// Thai Excel exports are often Windows-874 rather than UTF-8.
function decodeCSV(buf){try{return new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch{return new TextDecoder('windows-874').decode(buf);}}

// FileList from <input type="file" multiple> -> [{name, text}]
const readCSVFiles=list=>Promise.all([...list].map(async f=>({name:f.name,text:decodeCSV(await f.arrayBuffer())})));

// ===== ชุดข้อมูล =====
// แต่ละแท็บใช้ชุดข้อมูลหนึ่งชุด (หน้า dashboard บอกด้วย receiveCSV(apply, '<id>')) แท็บที่ใช้ชุดเดียวกันเห็นข้อมูลชุดเดียวกัน
// ปุ่มอัปโหลด/แชร์/ประวัติที่แถบด้านบน (index.html) ทำงานกับชุดข้อมูลของแท็บที่เปิดอยู่
// เพิ่มชุดข้อมูลใหม่: เพิ่มที่นี่ และที่ api/_datasets.js ให้ id ตรงกัน
//   name      ชื่อที่ผู้ใช้เห็น (ในหน้าต่างแชร์และประวัติ)
//   defaults  ข้อมูลตั้งต้น (path จากโฟลเดอร์โปรเจกต์) ใช้เมื่อยังไม่เคยแชร์ หรือรันในเครื่องด้วย python3 -m http.server
const DATASETS={
  report:  {name:'รายงานจำนวนคำร้องและความเสียหาย',defaults:['data/md_flood_report.csv']},
  supplies:{name:'รายงานการแจกจ่ายถุงยังชีพ',defaults:['data/relief_supplies.csv']},
};
const PROJECT_ROOT=new URL('../../',document.currentScript.src); // this file is dashboards/shared/csv.js, loaded by index.html and by every dashboard
const apiUrl=(name,dataset,extra='')=>new URL(`api/${name}?dataset=${encodeURIComponent(dataset)}${extra}`,PROJECT_ROOT).href;

const thaiTime=iso=>new Date(iso).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
function describeFiles(files,source,publishedAt){
  const names=files.map(f=>f.name);
  const list=names.length===1?names[0]:`${names.length} ไฟล์: ${names.join(', ')}`;
  if(source==='published') return `ข้อมูลล่าสุด แชร์เมื่อ ${thaiTime(publishedAt)} · ${list}`;
  if(source==='default') return `ข้อมูลตั้งต้น · ${list}`;
  if(source==='history') return `${list} · ชุดที่แชร์เมื่อ ${thaiTime(publishedAt)} · ตัวอย่าง ยังไม่ได้แชร์ (กด "แชร์" เพื่อใช้ชุดนี้อีกครั้ง หรือรีเฟรชหน้าเพื่อกลับไปดูข้อมูลล่าสุด)`;
  return `${list} · ตัวอย่าง ยังไม่ได้แชร์ (รีเฟรชหน้าเพื่อกลับไปดูข้อมูลล่าสุด)`;
}

// -> {files:[{name,text}], label}, or null when nothing can be loaded (e.g. page opened via file://)
async function loadInitialData(dataset){
  try{
    const res=await fetch(apiUrl('latest',dataset),{cache:'no-store'});
    if(res.ok){const m=await res.json();return {files:m.files,label:describeFiles(m.files,'published',m.publishedAt)};}
    if(res.status!==404) console.warn('อ่านข้อมูลที่แชร์ไม่ได้:',res.status);
  }catch(err){/* no API here (local server or file://) */}
  try{
    const files=await Promise.all(DATASETS[dataset].defaults.map(async path=>{
      const res=await fetch(new URL(path,PROJECT_ROOT),{cache:'no-cache'});
      if(!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return {name:path.split('/').pop(),text:decodeCSV(await res.arrayBuffer())};
    }));
    return {files,label:describeFiles(files,'default')};
  }catch(err){console.warn('ไม่ได้โหลดข้อมูลตั้งต้น:',err.message);return null;}
}

// Share confirmation. Asks for a password only when the server says one is set (PUBLISH_PASSWORD).
// -> {password} when confirmed, null when cancelled
function askShare(dataset,files,needPassword,note){
  return new Promise(resolve=>{
    const dlg=document.createElement('dialog');
    dlg.style.cssText='border:1px solid #d5d8de;border-radius:14px;padding:20px 22px;width:min(400px,calc(100vw - 32px));font:inherit;color:#303947';
    dlg.innerHTML=`<form method="dialog">
      <strong style="display:block;font-size:16px">แชร์ข้อมูลชุดนี้ให้ทุกคน?</strong>
      <p data-scope style="margin:6px 0 8px;font-size:13px;color:#5a6270"></p>
      <p data-files style="margin:0 0 12px;font-size:13px;font-weight:700;overflow-wrap:anywhere"></p>
      <p data-note style="margin:0 0 8px;font-size:13px;color:#B42318"></p>
      <input type="password" autocomplete="current-password" placeholder="รหัสผ่านสำหรับแชร์" style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #c9cdd4;border-radius:8px;font:inherit">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button value="cancel" formnovalidate style="padding:8px 14px;border-radius:8px;border:1px solid #c9cdd4;background:#fff;font:inherit;cursor:pointer">ยกเลิก</button>
        <button value="ok" style="padding:8px 14px;border-radius:8px;border:0;background:#157347;color:#fff;font:inherit;font-weight:700;cursor:pointer">แชร์</button>
      </div></form>`;
    const pw=dlg.querySelector('input'),noteEl=dlg.querySelector('[data-note]');
    dlg.querySelector('[data-scope]').textContent=`ชุดข้อมูล "${DATASETS[dataset].name}": ผู้ชมทุกคนจะเห็นข้อมูลชุดนี้ในทุกแท็บที่ใช้ชุดข้อมูลนี้ แทนข้อมูลเดิม เมื่อเปิดหรือรีเฟรชหน้า`;
    dlg.querySelector('[data-files]').textContent=files.map(f=>f.name).join(', '); // file names come from the user: textContent
    noteEl.textContent=note||'';noteEl.hidden=!note;
    pw.hidden=!needPassword;pw.required=needPassword;
    document.body.append(dlg);
    dlg.addEventListener('close',()=>{const ok=dlg.returnValue==='ok';const password=pw.value;dlg.remove();resolve(ok?{password}:null);});
    dlg.showModal();
  });
}

async function publishFiles(dataset,files,password){
  const headers={'content-type':'application/json'};
  if(password) headers['x-publish-password']=password;
  let res;
  try{res=await fetch(apiUrl('publish',dataset),{method:'POST',headers,body:JSON.stringify({files})});}
  catch(err){throw new Error('เชื่อมต่อระบบแชร์ไม่ได้');}
  const body=await res.json().catch(()=>({}));
  if(res.status===404||res.status===501) throw new Error('ปุ่มแชร์ใช้ได้เฉพาะบนเว็บที่ deploy บน Vercel');
  if(!res.ok){const err=new Error(body.error||`HTTP ${res.status}`);err.needPassword=!!body.needPassword;throw err;}
  return body; // {publishedAt, files:[names]}
}

// History of shares of one dataset (api/history). Resolves {publishedAt, files:[{name,text}]} for the share picked, or null.
// Picking only previews it; the share button in the top bar makes it the latest data for everyone again.
function showShareHistory(dataset){
  return new Promise(resolve=>{
    const dlg=document.createElement('dialog');
    dlg.style.cssText='border:1px solid #d5d8de;border-radius:14px;padding:20px 22px;width:min(560px,calc(100vw - 32px));font:inherit;color:#303947';
    dlg.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;gap:12px">
        <strong style="font-size:16px">ประวัติการแชร์</strong>
        <button data-close style="padding:6px 12px;border-radius:8px;border:1px solid #c9cdd4;background:#fff;font:inherit;cursor:pointer">ปิด</button></div>
      <p data-scope style="margin:6px 0 12px;font-size:13px;color:#5a6270"></p>
      <div data-list style="max-height:min(60vh,480px);overflow:auto;border-top:1px solid #e5eaf0"><p style="color:#5a6270;font-size:13px">กำลังโหลด…</p></div>`;
    dlg.querySelector('[data-scope]').textContent=`ชุดข้อมูล "${DATASETS[dataset].name}" · เลือก "ดูชุดนี้" เพื่อดูตัวอย่าง (เห็นคนเดียว) ถ้าต้องการให้ทุกคนเห็นชุดนั้นอีกครั้ง ให้กด "แชร์" ต่อ`;
    const box=dlg.querySelector('[data-list]');
    const done=v=>{dlg.close();dlg.remove();resolve(v);};
    dlg.querySelector('[data-close]').addEventListener('click',()=>done(null));
    dlg.addEventListener('cancel',e=>{e.preventDefault();done(null);});
    document.body.append(dlg);dlg.showModal();
    const message=text=>{const p=document.createElement('p');p.style.cssText='color:#5a6270;font-size:13px';p.textContent=text;box.replaceChildren(p);};
    fetch(apiUrl('history',dataset),{cache:'no-store'}).then(async res=>{
      if(res.status===404||res.status===501) return message('ประวัติการแชร์ใช้ได้เฉพาะบนเว็บที่ deploy บน Vercel');
      const body=await res.json().catch(()=>({}));
      if(!res.ok) return message('อ่านประวัติไม่ได้: '+(body.error||`HTTP ${res.status}`));
      if(!body.items.length) return message('ยังไม่เคยมีการแชร์ชุดข้อมูลนี้');
      box.replaceChildren(...body.items.map((item,i)=>{
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:12px;padding:10px 2px;border-bottom:1px solid #e5eaf0';
        const info=document.createElement('div');info.style.cssText='flex:1;min-width:0';
        const when=document.createElement('strong');when.style.cssText='display:block;font-size:14px';when.textContent=thaiTime(item.publishedAt);
        if(i===0){const tag=document.createElement('span');tag.textContent='ชุดปัจจุบัน';tag.style.cssText='margin-left:8px;padding:1px 8px;border-radius:999px;background:#E7F4EC;color:#157347;font-size:12px;font-weight:700';when.append(tag);}
        const names=document.createElement('small');names.style.cssText='display:block;color:#5a6270;overflow-wrap:anywhere';
        names.textContent=item.files?item.files.join(', '):'ไม่มีชื่อไฟล์ (แชร์ก่อนมีระบบประวัติ)'; // names come from uploads: textContent
        info.append(when,names);
        const pick=document.createElement('button');pick.type='button';pick.textContent='ดูชุดนี้';
        pick.style.cssText='flex:none;padding:7px 12px;border-radius:8px;border:1px solid #c9cdd4;background:#fff;font:inherit;cursor:pointer';
        pick.addEventListener('click',async()=>{
          pick.disabled=true;pick.textContent='กำลังโหลด…';
          try{
            const r=await fetch(apiUrl('history',dataset,`&id=${encodeURIComponent(item.id)}`));
            const share=await r.json().catch(()=>({}));
            if(!r.ok) throw new Error(share.error||`HTTP ${r.status}`);
            done(share);
          }catch(err){alert('โหลดชุดข้อมูลไม่สำเร็จ: '+err.message);pick.disabled=false;pick.textContent='ดูชุดนี้';}
        });
        row.append(info,pick);return row;
      }));
    }).catch(()=>message('ประวัติการแชร์ใช้ได้เฉพาะบนเว็บที่ deploy บน Vercel'));
  });
}

// ===== หน้า dashboard =====
// receiveCSV(apply, dataset): dataset คือ id ใน DATASETS (ไม่ใส่ = 'report')
// apply(files, label) คำนวณและแสดงผล และต้อง throw ก่อนเปลี่ยนหน้าเมื่อข้อมูลผิด แถบด้านบนจะแจ้งข้อผิดพลาดและย้อนกลับให้
// หน้า dashboard ไม่มีปุ่มอัปโหลด/แชร์ของตัวเอง ข้อมูลมาจากแถบด้านบน (index.html) ผ่าน postMessage
// (ใช้ postMessage เพราะบน file:// แต่ละ iframe เป็นคนละ origin เรียกฟังก์ชันข้ามกันตรงๆ ไม่ได้)
function receiveCSV(apply,dataset='report'){
  if(!DATASETS[dataset]) throw new Error(`ไม่รู้จักชุดข้อมูล "${dataset}" (เพิ่มใน DATASETS ของ shared/csv.js)`);
  const run=(files,label)=>{try{apply(files,label);return {ok:true};}catch(err){console.error(err);return {ok:false,error:err.message};}};
  if(window.parent===window){ // opened on its own (e.g. while developing a dashboard): show the latest or default data
    loadInitialData(dataset).then(data=>data&&run(data.files,data.label));
    return;
  }
  window.addEventListener('message',ev=>{
    const m=ev.data;
    if(ev.source!==window.parent||m?.type!=='csv:data')return;
    window.parent.postMessage({type:'csv:applied',id:m.id,...run(m.files,m.label)},'*');
  });
  window.parent.postMessage({type:'csv:ready',dataset},'*');
}

// ===== แถบด้านบน (index.html) =====
// input: <input type=file multiple>, shareBtn/historyBtn: <button> (shareBtn has a <span> for its text),
// labelEl: shows which data the open tab shows, frames(): the dashboard iframes.
// Returns {setActive(frame)}: call it when the visible tab changes.
function initDataControls({input,shareBtn,historyBtn,labelEl,frames}){
  let active=null,needPassword=false,seq=0;
  const tabDataset=new Map();       // iframe -> dataset id, learned from its "ready" message
  const state={};                   // dataset id -> {current, preview, touched, loading}
  const waiting=new Map();          // message id -> {resolve, pending tabs, errors}
  const ds=id=>state[id]??={current:null,preview:null,touched:false,loading:false};
  const tabsOf=id=>[...tabDataset].filter(([,d])=>d===id).map(([f])=>f);
  const send=(frame,data,id)=>frame.contentWindow.postMessage({type:'csv:data',id,files:data.files,label:data.label},'*');

  // The bar always shows the dataset of the open tab.
  function refresh(){
    const id=tabDataset.get(active);
    const s=id&&state[id];
    input.disabled=shareBtn.disabled=historyBtn.disabled=!id;
    shareBtn.hidden=!s?.preview;
    const text=!id||!s||s.loading?'กำลังโหลดข้อมูล…':s.current?.label||'ยังไม่มีข้อมูล · กด “อัปโหลด CSV”';
    labelEl.textContent=text;labelEl.title=text;
  }
  // Sends data to every loaded tab of a dataset; resolves with one message per tab that could not read it.
  function broadcast(id,data){
    const targets=tabsOf(id),msg=++seq;
    if(!targets.length) return Promise.resolve([]);
    return new Promise(resolve=>{
      waiting.set(msg,{resolve,pending:new Set(targets),errors:[]});
      targets.forEach(f=>send(f,data,msg));
      setTimeout(()=>{const w=waiting.get(msg);if(w){waiting.delete(msg);resolve(w.errors);}},15000); // a stuck tab must not block the bar
    });
  }
  async function loadDataset(id){
    const s=ds(id);s.loading=true;refresh();
    const data=await loadInitialData(id);
    s.loading=false;
    if(s.touched){refresh();return;} // an upload that landed first wins
    if(data){s.current=data;const errors=await broadcast(id,data);if(errors.length) console.error('ข้อมูลเริ่มต้นอ่านไม่ได้:',errors);}
    refresh();
  }
  window.addEventListener('message',ev=>{
    const frame=frames().find(f=>f.contentWindow===ev.source);
    if(!frame)return;
    const m=ev.data;
    if(m?.type==='csv:ready'){
      const id=DATASETS[m.dataset]?m.dataset:'report';
      tabDataset.set(frame,id);
      const s=ds(id);
      if(s.current) send(frame,s.current,++seq);             // a tab that loads later catches up
      else if(!s.loading&&!s.touched) loadDataset(id);        // first tab of this dataset: load its data
      refresh();
    }else if(m?.type==='csv:applied'){
      const w=waiting.get(m.id);if(!w)return;
      w.pending.delete(frame);if(!m.ok)w.errors.push(`แท็บ "${frame.title}": ${m.error}`);
      if(!w.pending.size){waiting.delete(m.id);w.resolve(w.errors);}
    }
  });
  // Preview files for this viewer only, in every tab of the open tab's dataset.
  // If any of those tabs rejects them, they all go back to what they showed before.
  async function tryPreview(id,files,label){
    const s=ds(id);s.touched=true;
    const errors=await broadcast(id,{files,label});
    if(errors.length){alert('อ่านไฟล์ CSV ไม่สำเร็จ\n'+errors.join('\n'));if(s.current)await broadcast(id,s.current);refresh();return;}
    s.current={files,label};s.preview=files;refresh();
  }
  input.addEventListener('change',async()=>{
    const id=tabDataset.get(active);
    const picked=[...input.files];input.value='';
    if(!picked.length||!id)return;
    try{const files=await readCSVFiles(picked);await tryPreview(id,files,describeFiles(files,'preview'));}
    catch(err){console.error(err);alert('อ่านไฟล์ CSV ไม่สำเร็จ: '+err.message);}
  });
  historyBtn.addEventListener('click',async()=>{
    const id=tabDataset.get(active);if(!id)return;
    const share=await showShareHistory(id);
    if(share) await tryPreview(id,share.files,describeFiles(share.files,'history',share.publishedAt));
  });
  const shareText=shareBtn.querySelector('span');
  shareBtn.addEventListener('click',async()=>{
    const id=tabDataset.get(active),s=id&&state[id];
    if(!s?.preview)return;
    let note='';
    for(;;){
      const answer=await askShare(id,s.preview,needPassword,note);
      if(!answer)return;
      shareBtn.disabled=true;shareText.textContent='กำลังแชร์…';
      try{
        const result=await publishFiles(id,s.preview,answer.password);
        s.current={files:s.preview,label:describeFiles(s.preview,'published',result.publishedAt)};
        s.preview=null;broadcast(id,s.current);
        alert('แชร์แล้ว ผู้ชมจะเห็นข้อมูลชุดนี้เมื่อเปิดหรือรีเฟรชหน้า (ภายในไม่เกิน 1 นาที)');
        return;
      }catch(err){
        if(!err.needPassword){alert('แชร์ไม่สำเร็จ: '+err.message);return;}
        needPassword=true;note=err.message; // server has a password set: ask again with the password field
      }finally{shareText.textContent='แชร์';refresh();}
    }
  });
  refresh();
  return {setActive(frame){active=frame;refresh();}};
}
