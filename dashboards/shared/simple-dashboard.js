// สร้าง dashboard จากการตั้งค่า (config) — ดูตัวอย่างและคำอธิบายทุกตัวเลือกใน dashboards/_template.html
// ต้องโหลด shared/csv.js ก่อนไฟล์นี้
'use strict';
function renderDashboard(cfg){
  const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=v=>v==null?'-':Number(v).toLocaleString('en-US',{maximumFractionDigits:2});
  const columns=cfg.columns||[], kpis=cfg.kpis||[];
  const numberCols=[...new Set([...columns.filter(c=>c.number).map(c=>c.column),...kpis.filter(k=>k.column).map(k=>k.column)])];
  const needCols=[...new Set([...columns.map(c=>c.column||c.distinct),...kpis.map(k=>k.column),cfg.groupBy,cfg.sortBy].filter(Boolean))];
  const add=(a,b)=>a==null?b:b==null?a:a+b;

  document.title=cfg.title;
  document.body.innerHTML=`<main class="sd-page">
  <header class="sd-hero"><div class="sd-eyebrow">${esc(cfg.eyebrow||'Dashboard')}</div><h1>${esc(cfg.title)}</h1>
    <p>ข้อมูล ณ ช่วงวันที่ <strong id="sd-period">-</strong></p></header>
  <section class="sd-bar"><div><strong>ข้อมูลรายงาน</strong><small id="sd-files">ยังไม่ได้อัปโหลดไฟล์ · กด “อัปโหลด CSV” (เลือกได้หลายไฟล์)</small></div>
    <label class="sd-upload"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0-4 4m4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg> อัปโหลด CSV<input id="sd-input" type="file" accept=".csv,text/csv" multiple hidden></label></section>
  <section class="sd-kpis">${kpis.map((k,i)=>`<article class="sd-card sd-kpi" style="--accent:${['#913D50','#6499D0','#61A58B','#D6AE62','#CE8296'][i%5]}"><span>${esc(k.label)}</span><strong id="sd-kpi-${i}">-</strong><small>${esc(k.unit||'')}</small></article>`).join('')}</section>
  <section class="sd-card sd-panel"><div class="sd-panel-head"><h2>${esc(cfg.tableTitle||'รายละเอียด')}</h2><span class="sd-badge" id="sd-count">-</span></div>
    <div class="sd-table-wrap"><table class="sd-table"><thead><tr><th>ลำดับ</th>${columns.map(c=>`<th class="${c.number||c.distinct?'num':''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody id="sd-tbody"><tr><td class="sd-empty" colspan="${columns.length+1}">ยังไม่มีข้อมูล · กด “อัปโหลด CSV” เพื่อแสดงข้อมูล</td></tr></tbody><tfoot id="sd-tfoot"></tfoot></table></div></section>
  </main>`;

  // files [{name,text}] -> {rows: filtered source rows, list: table rows, period}
  function build(files){
    const rows=[],periodLines=[];
    for(const f of files){
      const t=splitHeader(parseCSV(f.text),cfg.headerFirstColumn);
      if(!t) throw new Error(`${f.name}: ไม่พบแถวหัวคอลัมน์ "${cfg.headerFirstColumn}"`);
      const missing=needCols.filter(c=>!t.cols.includes(c));
      if(missing.length) throw new Error(`${f.name}: ไม่พบคอลัมน์ ${missing.join(', ')}`);
      const periodLine=t.before.map(r=>r.join('').trim()).find(x=>/\d{4}/.test(x));
      if(periodLine) periodLines.push(periodLine);
      for(const r of t.records){
        for(const c of numberCols) r[c]=toNum(r[c]);
        if(!cfg.filter||cfg.filter(r)) rows.push(r);
      }
    }
    if(!rows.length) throw new Error('ไม่พบแถวข้อมูลที่ตรงกับการตั้งค่าในไฟล์ที่เลือก');
    let list=rows.map(r=>({...r,_rows:[r]}));
    if(cfg.groupBy){
      const groups=new Map();
      for(const r of rows){
        const g=groups.get(r[cfg.groupBy]);
        if(!g){groups.set(r[cfg.groupBy],{...r,_rows:[r]});continue;}
        g._rows.push(r);
        for(const c of numberCols) g[c]=add(g[c],r[c]);
      }
      list=[...groups.values()];
    }
    if(cfg.sortBy) list.sort((a,b)=>(b[cfg.sortBy]??-Infinity)-(a[cfg.sortBy]??-Infinity));
    return {rows,list,period:mergePeriods(periodLines)};
  }

  function render({rows,list,period},label){
    const distinct=(rs,col)=>new Set(rs.map(r=>r[col]).filter(Boolean)).size;
    const total=col=>rows.reduce((s,r)=>add(s,r[col]),null);
    document.getElementById('sd-period').textContent=period.full;
    document.getElementById('sd-files').textContent=label;
    document.getElementById('sd-count').textContent=`${fmt(list.length)} รายการ`;
    kpis.forEach((k,i)=>{document.getElementById('sd-kpi-'+i).textContent=fmt(k.count?list.length:total(k.column));});
    const cell=(c,r,rs)=>c.distinct?`<td class="num">${fmt(distinct(rs,c.distinct))}</td>`:c.number?`<td class="num">${fmt(r[c.column])}</td>`:`<td>${esc(r[c.column]||'-')}</td>`;
    document.getElementById('sd-tbody').innerHTML=list.map((r,i)=>`<tr><td class="sd-order">${String(i+1).padStart(2,'0')}</td>${columns.map(c=>cell(c,r,r._rows)).join('')}</tr>`).join('');
    const totals=Object.fromEntries(numberCols.map(c=>[c,total(c)]));
    document.getElementById('sd-tfoot').innerHTML=`<tr><td>รวม</td>${columns.map((c,i)=>i===0&&!c.number&&!c.distinct?'<td></td>':cell(c,totals,rows)).join('')}</tr>`;
  }

  document.getElementById('sd-input').addEventListener('change',async ev=>{
    const picked=[...ev.target.files];ev.target.value='';
    if(!picked.length)return;
    try{
      const report=build(await readCSVFiles(picked));
      render(report,picked.length===1?picked[0].name:`${picked.length} ไฟล์: ${picked.map(f=>f.name).join(', ')}`);
    }catch(err){console.error(err);alert('อ่านไฟล์ CSV ไม่สำเร็จ: '+err.message);}
  });
}
