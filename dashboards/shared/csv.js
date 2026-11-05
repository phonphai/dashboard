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
