
// ---- Date helpers (display dd-mm-yyyy) ----
const pad2 = n => String(n).padStart(2,'0');
const fmtDateDisp = d => {
  const dt = new Date(d);
  return `${pad2(dt.getDate())}-${pad2(dt.getMonth()+1)}-${dt.getFullYear()}`;
};
const fmtDateISO = d => d.toISOString().slice(0,10);
const addDays = (d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x;}
const parseDate = s => { const d=new Date(s); return isNaN(d)?null:d; };

let DRUGS = [];
let selectedPlans = [];

const drugSelect = document.getElementById('drugSelect');
const strengthSelect = document.getElementById('strengthSelect');
const doseMlPerDay = document.getElementById('doseMlPerDay');
const rtmCheckbox = document.getElementById('rtmCheckbox');
const addDrugBtn = document.getElementById('addDrugBtn');

const startDateInput = document.getElementById('startDate');
const endDateInput = document.getElementById('endDate');
const totalDaysInput = document.getElementById('totalDays');

const selectedTbody = document.querySelector('#selectedTable tbody');
const summaryTbody = document.querySelector('#summaryTable tbody');

fetch('drugs.json').then(r=>r.json()).then(d=>{ DRUGS=d; populateSelectors(); });

function syncDates(){
  const s=parseDate(startDateInput.value);
  const e=parseDate(endDateInput.value);
  const days=parseInt(totalDaysInput.value,10);
  if (s && days>0) endDateInput.value = fmtDateISO(addDays(s, days-1));
  else if (s && e) totalDaysInput.value = Math.round((e-s)/(1000*3600*24))+1;
}
[startDateInput, endDateInput, totalDaysInput].forEach(el => el.addEventListener('input', syncDates));

function populateSelectors(){
  const names = [...new Set(DRUGS.map(d=>d.name))].filter(Boolean);
  drugSelect.innerHTML = names.map(n=>`<option value="${n}">${n}</option>`).join('');
  renderStrengths();
}
function renderStrengths(){
  const name = (drugSelect.value||"").trim();
  const items = DRUGS.filter(d=>d.name===name);
  const strengths=[...new Set(items.map(x=>x.strength||""))];
  strengthSelect.innerHTML = strengths.map(s=>`<option value="${s}">${s||"(ไม่มีระบุ)"}</option>`).join('');
  const canRTM = items.some(x=>x.supports_rtm);
  rtmCheckbox.disabled = !canRTM;
  if (!canRTM) rtmCheckbox.checked = false;
}
drugSelect.addEventListener('change', renderStrengths);

function bottlesForDays(days, mlPerDay, bottleMl){ return Math.ceil( (mlPerDay*days) / bottleMl ); }
function chipClass(dateISO, startISO, type){
  // first-day chips are green
  return (dateISO===startISO) ? 'green' : (type==='LIQUID' ? 'blue' : 'orange');
}
function chipsHTML(schedule, startISO){
  return '<div class="schedule-chips">'+schedule.map(s=>{
    const cls = chipClass(s.date, startISO, s.type);
    return `<span class="chip ${cls}"><b>${fmtDateDisp(new Date(s.date))}</b> • ${s.type} • ${s.bottles} ขวด (${s.range})</span>`;
  }).join('')+'</div>';
}
function joinComponentsText(components){
  if (!components||!components.length) return "-";
  return components.map(c=>{
    if (c.ingredient && c.qty_text) return `${c.ingredient} ${c.qty_text}`;
    if (c.ingredient && (c.qty_num||c.qty_num===0) && c.qty_unit_th) return `${c.ingredient} ${c.qty_num} ${c.qty_unit_th}`;
    return c.ingredient||c.qty_text||"";
  }).join(" + ");
}

// RTM rule fixed:
// - Liquid covers 1..L
// - First RTM coverage is (L+1 .. min(S, T)), but dispense date is day 1 (to minimize visits)
// - Next RTM blocks every S days starting at S+1: (S+1..min(2S,T)), (2S+1..min(3S,T))...
function computePlan(cfg){
  const {name,strength,bottleMl,expiryDays,mlPerDay,startDate,totalDays,components,supportsRTM,rtmShelfDays,useRTM} = cfg;
  const L = expiryDays || 0, S = rtmShelfDays || 0, T = totalDays;
  const schedule=[];
  const startISO = fmtDateISO(startDate);

  // Liquid first
  const liquidDays = Math.min(L, T);
  if (liquidDays>0)
    schedule.push({type:"LIQUID", date:startISO, days:liquidDays, bottles:bottlesForDays(liquidDays,mlPerDay,bottleMl), range:`วัน 1–${liquidDays}`});

  if (useRTM && supportsRTM && T > L){
    const firstStart = L + 1;
    const firstEnd = Math.min(S, T);
    if (firstStart <= firstEnd){
      const days = firstEnd - firstStart + 1;
      // date shown as start day (day 1) to indicate dispensing on first day
      schedule.push({type:"RTM", date:startISO, days, bottles:bottlesForDays(days,mlPerDay,bottleMl), range:`วัน ${firstStart}–${firstEnd}`});
    }
    // Subsequent RTM blocks
    let current = S + 1;
    while (current <= T){
      const end = Math.min(current + S - 1, T);
      const days = end - current + 1;
      schedule.push({type:"RTM", date:fmtDateISO(addDays(startDate, current-1)), days, bottles:bottlesForDays(days,mlPerDay,bottleMl), range:`วัน ${current}–${end}`});
      current = end + 1;
    }
  } else if (T > liquidDays){
    let remaining = T - liquidDays;
    let cursor = addDays(startDate, liquidDays);
    while(remaining>0){
      const take = Math.min(L||T, remaining);
      schedule.push({type:"LIQUID", date:fmtDateISO(cursor), days:take, bottles:bottlesForDays(take,mlPerDay,bottleMl), range:`วัน ${T-remaining+1}–${T-remaining+take}`});
      remaining -= take; cursor = addDays(cursor, take);
    }
  }
  return {name,strength,mlPerDay,bottleMl,expiryDays,components:(components||[]),supportsRTM,useRTM,rtmShelfDays,schedule,startISO};
}

addDrugBtn.addEventListener('click', ()=>{
  const name=(drugSelect.value||"").trim();
  const strength=(strengthSelect.value||"").trim();
  const mlPerDay=parseFloat(doseMlPerDay.value);
  if (!(name && mlPerDay>0)) return alert("กรุณาเลือกยาและกรอก ml/day");
  const items = DRUGS.filter(d=>d.name===name && (d.strength||"")===(strength||""));
  if (!items.length) return alert("ไม่พบรายการยา");
  const d0=items[0];
  const s=parseDate(startDateInput.value);
  const e=parseDate(endDateInput.value);
  let days=parseInt(totalDaysInput.value,10)||0;
  if (!(s && (e || days>0))) return alert("กรุณากรอกวันที่เริ่ม และวันนัดหรือจำนวนวันทั้งหมด");
  if (days<=0 && e) days = Math.round((e-s)/(1000*3600*24))+1;
  const plan = computePlan({
    name:d0.name,strength:d0.strength,bottleMl:d0.bottle_ml,expiryDays:d0.expiry_days,mlPerDay,
    startDate:s,totalDays:days,components:(d0.components||[]),supportsRTM:d0.supports_rtm,rtmShelfDays:d0.rtm_shelf_days,useRTM:rtmCheckbox.checked
  });
  appendSelectedRow(plan);
  refreshSummary();
});

function appendSelectedRow(plan){
  selectedPlans.push(plan);
  const perBottleTxt = joinComponentsText(plan.components);
  const totalBottles = plan.schedule.reduce((a,s)=>a+s.bottles,0);
  const tr=document.createElement('tr');
  tr.innerHTML=`
    <td><input type="checkbox" class="pickToggle" checked></td>
    <td>${plan.name}</td>
    <td>${plan.strength||""}</td>
    <td>${plan.mlPerDay}</td>
    <td>${plan.bottleMl}</td>
    <td>${plan.expiryDays}</td>
    <td>${plan.useRTM?'<span class="badge">RTM</span>':'-'}</td>
    <td>${perBottleTxt}</td>
    <td>${totalBottles} ขวด</td>
    <td><button class="delBtn">ลบ</button></td>`;
  selectedTbody.appendChild(tr);
  tr.querySelector('.delBtn').addEventListener('click', ()=>{ 
    const i=[...selectedTbody.children].indexOf(tr);
    selectedPlans.splice(i,1); tr.remove(); refreshSummary();
  });
  tr.querySelector('.pickToggle').addEventListener('change', refreshSummary);
}

function refreshSummary(){
  summaryTbody.innerHTML="";
  [...selectedTbody.querySelectorAll('tr')].forEach((row,idx)=>{
    if (!row.querySelector('.pickToggle').checked) return;
    const plan=selectedPlans[idx];
    const perBottleTxt = joinComponentsText(plan.components);
    const totalBottles = plan.schedule.reduce((a,s)=>a+s.bottles,0);
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${plan.name}</td><td>${plan.strength||""}</td><td>${plan.mlPerDay}</td><td>${plan.bottleMl}</td><td>${plan.expiryDays}</td><td>${perBottleTxt}</td><td><b>${totalBottles} ขวด</b></td>`;
    summaryTbody.appendChild(tr);
    const tr2=document.createElement('tr'); tr2.className='subrow';
    const td=document.createElement('td'); td.colSpan=7; td.innerHTML=chipsHTML(plan.schedule, plan.startISO);
    tr2.appendChild(td); summaryTbody.appendChild(tr2);
  });
}
document.getElementById('printBtn').addEventListener('click', ()=>window.print());
