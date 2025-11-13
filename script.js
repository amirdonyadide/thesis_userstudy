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
  submitLabel: $('#submitLabel'),
  submitSpin:  $('#submitSpin'),
  done:    $('#done'),
};

function startTrial(i){
  const t = trials[i]; current = t;
  el.submit.disabled = true;
  el.imgL.onload = el.imgR.onload = maybeEnable;
  el.imgL.onerror = el.imgR.onerror = maybeEnable;
  function maybeEnable(){ if (el.imgL.complete && el.imgR.complete) el.submit.disabled = false; }

  el.counter.textContent = `Item ${i+1} / ${trials.length}`;
  const pct = Math.round((i) / trials.length * 100);
  const bar = document.getElementById('progFill');
  if (bar) bar.style.width = `${pct}%`;

  // current images
  el.imgL.src = t.input_url;
  el.imgR.src = t.generalized_url;
  el.text.value = '';
  tStart = Date.now();
  setTimeout(()=> el.text.focus(), 0);

  // ✅ PRELOAD NEXT PAIR
  if (i + 1 < trials.length){
    const next = trials[i+1];
    const img1 = new Image();
    const img2 = new Image();
    img1.src = next.input_url;
    img2.src = next.generalized_url;
  }
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

    // read any saved participant_id to allow resume
    let pid = localStorage.getItem('study_participant') || '';

    // pass token + name (and participant_id if present) to backend
    const params = new URLSearchParams({
      action: 'init_session',
      token,
      first_name: f,
      last_name:  l,
    });

    // include participant_id when resuming
    if (pid) params.set('participant_id', pid);

    const res = await fetch(`${API}?${params.toString()}`);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Init failed');

    // Save/refresh participant_id for future resumes
    participant = data.participant_id;
    localStorage.setItem('study_participant', participant);

    trials = (data.trials || []).sort((a,b)=>a.order_index-b.order_index);
    if (trials.length === 0) throw new Error('No trials returned');
    // ✅ warm up cache for first 2–3 items
    for (let k = 0; k < Math.min(3, trials.length); k++){
    const t = trials[k];
    const a = new Image(); a.src = t.input_url;
    const b = new Image(); b.src = t.generalized_url;
}

    // show instructions next
    el.welcome.classList.add('hidden');
    el.instructions.classList.remove('hidden');

  } catch(err) {
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

// Allow Ctrl/Cmd + Enter to submit
el.text.addEventListener('keydown', (e)=>{
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    e.preventDefault();
    el.submit.click();
  }
});

let sending = false;
// STEP 3: submit each response
el.submit.addEventListener('click', async ()=>{
  if (sending) return;
  sending = true;
  el.submit.disabled = true;

  // show loading state
  if (el.submitLabel) el.submitLabel.textContent = 'Submitting...';
  if (el.submitSpin)  el.submitSpin.classList.remove('hidden');

  const txt = el.text.value.trim();
  try{
    if (txt.split(/\s+/).length < 4){
      alert('Please write at least 4 words.');
      sending = false;
      el.submit.disabled = false;
      // reset visual state
      if (el.submitLabel) el.submitLabel.textContent = 'Submit';
      if (el.submitSpin)  el.submitSpin.classList.add('hidden');
      return;
    }

    const dur = Date.now() - tStart;

    const client_meta = {
      ua: navigator.userAgent,
      first: localStorage.getItem('study_first') || '',
      last:  localStorage.getItem('study_last')  || '',
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
    if (!data.ok){
      alert('Submit failed: ' + data.error);
      return;
    }

    idx++;
    if (idx >= trials.length){
      el.trial.classList.add('hidden');
      el.done.classList.remove('hidden');
    } else {
      startTrial(idx);
    }
  }
  finally {
    sending = false;
    el.submit.disabled = false;
    // hide spinner + reset label
    if (el.submitLabel) el.submitLabel.textContent = 'Submit';
    if (el.submitSpin)  el.submitSpin.classList.add('hidden');
  }
});

// (Optional) auto-fill form from previous session
window.addEventListener('DOMContentLoaded', ()=>{
  const f = localStorage.getItem('study_first'); if (f) el.first.value = f;
  const l = localStorage.getItem('study_last');  if (l) el.last.value = l;
  const t = localStorage.getItem('study_token'); if (t) el.token.value = t;
});
