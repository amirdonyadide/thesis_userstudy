// script.js
const API = 'https://script.google.com/macros/s/AKfycbwy-WwkVBq7iDytfCG7g-vGulbr0SmE2RAOCxR6dL-vFVWV26eQIAMXB6Jfr2jVdQQ31A/exec';

let trials = [], idx = 0, participant = '', tStart = 0;
let current = null;

// cache elements
const $ = (s)=>document.querySelector(s);
const el = {
  welcome: $('#welcome'),
  form:    $('#entryForm'),
  first:   $('#firstName'),
  last:    $('#lastName'),
  token:   $('#token'),
  consent: $('#consent'),
  instructions: $('#instructions'),
  begin:   $('#begin'),
  trial:   $('#trial'),
  counter: $('#counter'),
  imgL:    $('#imgL'),
  imgR:    $('#imgR'),
  text:    $('#text'),
  submit:  $('#submit'),
  done:    $('#done'),
};

function startTrial(i){
  const t = trials[i]; current = t;
  el.counter.textContent = `Item ${i+1} / ${trials.length}`;
  el.imgL.src = t.input_url;
  el.imgR.src = t.generalized_url;
  el.text.value = '';
  tStart = Date.now();
  console.log('Image URLs:', t.input_url, t.generalized_url);
}

// STEP 1: handle form submit → call init_session (with token), then show instructions
el.form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  if (!el.consent.checked) { alert('Please agree to participate.'); return; }

  const f = el.first.value.trim();
  const l = el.last.value.trim();
  const token = el.token.value.trim();

  if (f.length < 2 || l.length < 2){ alert('Please enter your first and last name.'); return; }
  if (!token){ alert('Please enter your access key.'); return; }

  // store locally so refresh resumes
  localStorage.setItem('study_first', f);
  localStorage.setItem('study_last', l);
  localStorage.setItem('study_token', token);

  try{
    el.form.querySelector('button[type="submit"]').disabled = true;

    // pass token to backend so it can validate (Tokens sheet)
    const res = await fetch(`${API}?action=init_session&token=${encodeURIComponent(token)}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Init failed');

    participant = data.participant_id;
    localStorage.setItem('study_participant', participant);

    trials = (data.trials || []).sort((a,b)=>a.order_index-b.order_index);
    if (trials.length === 0) throw new Error('No trials returned');

    // show instructions next
    el.welcome.classList.add('hidden');
    el.instructions.classList.remove('hidden');

  }catch(err){
    alert('Could not start: ' + (err.message || err));
    console.error(err);
    el.form.querySelector('button[type="submit"]').disabled = false;
  }
});

// STEP 2: begin after reading instructions
el.begin.addEventListener('click', ()=>{
  el.instructions.classList.add('hidden');
  el.trial.classList.remove('hidden');
  startTrial(0);
});

// STEP 3: submit each response
el.submit.addEventListener('click', async ()=>{
  const txt = el.text.value.trim();
  if (txt.split(/\s+/).length < 4){ alert('Please write at least 4 words.'); return; }

  const dur = Date.now() - tStart;

  // attach participant meta (name/token) into client_meta so you can export them later
  const client_meta = {
    ua: navigator.userAgent,
    first: localStorage.getItem('study_first') || '',
    last: localStorage.getItem('study_last') || '',
    token: localStorage.getItem('study_token') || ''
  };

  const fd = new URLSearchParams({
    action: 'submit',
    participant_id: participant,
    assignment_id: current.assignment_id,
    tile_id: current.tile_id,
    free_text: txt,
    duration_ms: String(dur),
    client_meta: JSON.stringify(client_meta)
  });

  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: fd
  });
  const data = await res.json();
  if (!data.ok){ alert('Submit failed: ' + data.error); return; }

  idx++;
  if (idx >= trials.length){
    el.trial.classList.add('hidden');
    el.done.classList.remove('hidden');
  } else {
    startTrial(idx);
  }
});

// (Optional) auto-fill form from previous session
window.addEventListener('DOMContentLoaded', ()=>{
  const f = localStorage.getItem('study_first'); if (f) el.first.value = f;
  const l = localStorage.getItem('study_last');  if (l) el.last.value = l;
  const t = localStorage.getItem('study_token'); if (t) el.token.value = t;
});
