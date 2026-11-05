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

// ===== ที่มาของข้อมูล =====
// ตอนเปิดหน้า: 1) ข้อมูลล่าสุดที่ทีมกรมแชร์ (/api/latest บน Vercel)  2) ถ้าไม่มี ใช้ข้อมูลตั้งต้นใน data/
// ทุกแท็บใช้ข้อมูลชุดเดียวกัน (path เทียบกับไฟล์ใน dashboards/)
const LATEST_API='../api/latest';
const PUBLISH_API='../api/publish';
// ข้อมูลตั้งต้น: ใช้เมื่อยังไม่เคยแชร์ หรือรันในเครื่องด้วย python3 -m http.server
const DEFAULT_CSV_FILES=['../data/md_flood_report.csv'];

const thaiTime=iso=>new Date(iso).toLocaleString('th-TH',{dateStyle:'medium',timeStyle:'short'});
function describeFiles(files,source,publishedAt){
  const names=files.map(f=>f.name);
  const list=names.length===1?names[0]:`${names.length} ไฟล์: ${names.join(', ')}`;
  if(source==='published') return `ข้อมูลล่าสุด แชร์เมื่อ ${thaiTime(publishedAt)} · ${list}`;
  if(source==='default') return `ข้อมูลตั้งต้น · ${list}`;
  return `${list} · ตัวอย่าง ยังไม่ได้แชร์ (รีเฟรชหน้าเพื่อกลับไปดูข้อมูลล่าสุด)`;
}

// -> {files:[{name,text}], label}, or null when nothing can be loaded (e.g. page opened via file://)
async function loadInitialData(){
  try{
    const res=await fetch(LATEST_API,{cache:'no-store'});
    if(res.ok){const m=await res.json();return {files:m.files,label:describeFiles(m.files,'published',m.publishedAt)};}
    if(res.status!==404) console.warn('อ่านข้อมูลที่แชร์ไม่ได้:',res.status);
  }catch(err){/* no API here (local server or file://) */}
  try{
    const files=await Promise.all(DEFAULT_CSV_FILES.map(async path=>{
      const res=await fetch(path,{cache:'no-cache'});
      if(!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      return {name:path.split('/').pop(),text:decodeCSV(await res.arrayBuffer())};
    }));
    return {files,label:describeFiles(files,'default')};
  }catch(err){console.warn('ไม่ได้โหลดข้อมูลตั้งต้น:',err.message);return null;}
}

// Share confirmation. Asks for a password only when the server says one is set (PUBLISH_PASSWORD).
// -> {password} when confirmed, null when cancelled
function askShare(files,needPassword,note){
  return new Promise(resolve=>{
    const dlg=document.createElement('dialog');
    dlg.style.cssText='border:1px solid #d5d8de;border-radius:14px;padding:20px 22px;width:min(380px,calc(100vw - 32px));font:inherit;color:#303947';
    dlg.innerHTML=`<form method="dialog">
      <strong style="display:block;font-size:16px">แชร์ข้อมูลชุดนี้ให้ทุกคน?</strong>
      <p style="margin:6px 0 8px;font-size:13px;color:#5a6270">ผู้ชมทุกคนจะเห็นข้อมูลชุดนี้ในทุกแท็บแทนข้อมูลเดิม เมื่อเปิดหรือรีเฟรชหน้า</p>
      <p data-files style="margin:0 0 12px;font-size:13px;font-weight:700;overflow-wrap:anywhere"></p>
      <p data-note style="margin:0 0 8px;font-size:13px;color:#B42318"></p>
      <input type="password" autocomplete="current-password" placeholder="รหัสผ่านสำหรับแชร์" style="width:100%;box-sizing:border-box;padding:9px 11px;border:1px solid #c9cdd4;border-radius:8px;font:inherit">
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
        <button value="cancel" formnovalidate style="padding:8px 14px;border-radius:8px;border:1px solid #c9cdd4;background:#fff;font:inherit;cursor:pointer">ยกเลิก</button>
        <button value="ok" style="padding:8px 14px;border-radius:8px;border:0;background:#157347;color:#fff;font:inherit;font-weight:700;cursor:pointer">แชร์</button>
      </div></form>`;
    const pw=dlg.querySelector('input'),noteEl=dlg.querySelector('[data-note]');
    dlg.querySelector('[data-files]').textContent=files.map(f=>f.name).join(', '); // file names come from the user: textContent
    noteEl.textContent=note||'';noteEl.hidden=!note;
    pw.hidden=!needPassword;pw.required=needPassword;
    document.body.append(dlg);
    dlg.addEventListener('close',()=>{const ok=dlg.returnValue==='ok';const password=pw.value;dlg.remove();resolve(ok?{password}:null);});
    dlg.showModal();
  });
}

async function publishFiles(files,password){
  const headers={'content-type':'application/json'};
  if(password) headers['x-publish-password']=password;
  let res;
  try{res=await fetch(PUBLISH_API,{method:'POST',headers,body:JSON.stringify({files})});}
  catch(err){throw new Error('เชื่อมต่อระบบแชร์ไม่ได้');}
  const body=await res.json().catch(()=>({}));
  if(res.status===404||res.status===501) throw new Error('ปุ่มแชร์ใช้ได้เฉพาะบนเว็บที่ deploy บน Vercel');
  if(!res.ok){const err=new Error(body.error||`HTTP ${res.status}`);err.needPassword=!!body.needPassword;throw err;}
  return body; // {publishedAt, files:[names]}
}

// The share button looks the same on every page and stands apart from the upload button (green, white text: 5.9:1).
function addShareStyles(){
  if(document.getElementById('csv-share-style'))return;
  const css=document.createElement('style');css.id='csv-share-style';
  css.textContent=`.csv-publish{display:inline-flex!important;align-items:center;gap:6px;background:#157347!important;color:#fff!important;border:1px solid #157347!important;font:inherit;font-weight:700!important;cursor:pointer}
.csv-publish:hover{background:#0F5C38!important;border-color:#0F5C38!important}
.csv-publish:disabled{opacity:.65;cursor:progress}
.csv-publish svg{width:16px!important;height:16px!important;flex:none}`;
  document.head.append(css);
}

// Wires a page to its data:
// - on load shows the latest shared data (or data/ defaults)
// - an upload is a private preview for the uploader, with a "แชร์" button that makes it the latest data for everyone
// apply(files, label) must throw on bad data before changing the page, so a bad upload keeps the current view.
function connectCSV(input,apply){
  addShareStyles();
  const label=input.closest('label');
  const publishBtn=document.createElement('button');
  publishBtn.type='button';publishBtn.className=(label?.className||'')+' csv-publish';
  publishBtn.title='แชร์ข้อมูลที่อัปโหลดให้ผู้ชมทุกคน';
  publishBtn.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/></svg><span>แชร์</span>';
  const btnText=publishBtn.querySelector('span');
  publishBtn.style.display='none';
  (label||input).after(publishBtn);

  let uploaded=false,preview=null,needPassword=false; // an upload that lands before the initial data finishes loading wins
  input.addEventListener('change',async()=>{
    const picked=[...input.files];input.value='';
    if(!picked.length)return;
    uploaded=true;
    try{const files=await readCSVFiles(picked);apply(files,describeFiles(files,'preview'));preview=files;publishBtn.style.display='';}
    catch(err){console.error(err);alert('อ่านไฟล์ CSV ไม่สำเร็จ: '+err.message);}
  });
  publishBtn.addEventListener('click',async()=>{
    if(!preview)return;
    let note='';
    for(;;){
      const answer=await askShare(preview,needPassword,note);
      if(!answer)return;
      publishBtn.disabled=true;btnText.textContent='กำลังแชร์…';
      try{
        const result=await publishFiles(preview,answer.password);
        apply(preview,describeFiles(preview,'published',result.publishedAt));
        preview=null;publishBtn.style.display='none';
        alert('แชร์แล้ว ผู้ชมจะเห็นข้อมูลชุดนี้เมื่อเปิดหรือรีเฟรชหน้า (ภายในไม่เกิน 1 นาที)');
        return;
      }catch(err){
        if(!err.needPassword){alert('แชร์ไม่สำเร็จ: '+err.message);return;}
        needPassword=true;note=err.message; // server has a password set: ask again with the password field
      }finally{publishBtn.disabled=false;btnText.textContent='แชร์';}
    }
  });
  loadInitialData().then(data=>{
    if(!data||uploaded)return;
    try{apply(data.files,data.label);}catch(err){console.error('ข้อมูลเริ่มต้นอ่านไม่ได้:',err);}
  });
}
