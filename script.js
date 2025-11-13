// script.js
const API = 'https://script.google.com/macros/s/AKfycbwy-WwkVBq7iDytfCG7g-vGulbr0SmE2RAOCxR6dL-vFVWV26eQIAMXB6Jfr2jVdQQ31A/exec';

let trials = [];
let idx = 0;
let participant = '';
let tStart = 0;
let current = null;
let sending = false;  // block double-clicks

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
  progFill: $('#progFill'),
};

// small in-memory state so we don't hammer localStorage
const state = {
  first: '',
  last:  '',
  token: ''
};

function startTrial(i){
  const t = trials[i];
  current = t;

  // disable submit until both images are loaded (or error)
  el.submit.disabled = true;
  function maybeEnable(){
    if (el.imgL.complete && el.imgR.complete) {
      el.submit.disabled = false;
    }
  }
  el.imgL.onload  = maybeEnable;
  el.imgR.onload  = maybeEnable;
  el.imgL.onerror = maybeEnable;
  el.imgR.onerror = maybeEnable;

  // counter + progress
  el.counter.textContent = `Item ${i+1} / ${trials.length}`;
  if (el.progFill) {
    const pct = Math.round((i) / trials.length * 100);
    el.progFill.style.width = `${pct}%`;
  }

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

// STEP 1: form submit → init_session
el.form.addEventListener('submit', async (ev)=>{
  ev.preventDefault();
  if (!el.consent.checked) { alert('Please agree to participate.'); return; }

  const f = el.first.value.trim();
  const l = el.last.value.trim();
  const token = el.token.value.trim();

  if (f.length < 2 || l.length < 2){ alert('Please enter your first and last name.'); return; }
  if (!token){ alert('Please enter your access key.'); return; }

  // update state + save locally
  state.first = f;
  state.last  = l;
  state.token = token;
  localStorage.setItem('study_first', f);
  localStorage.setItem('study_last',  l);
  localStorage.setItem('study_token', token);

  const startBtn = el.form.querySelector('button[type="submit"]');
  try{
    if (startBtn) startBtn.disabled = true;

    // resume support
    let pid = localStorage.getItem('study_participant') || '';

    const params = new URLSearchParams({
      action: 'init_session',
      token,
      first_name: f,
      last_name:  l,
    });
    if (pid) params.set('participant_id', pid);

    const res = await fetch(`${API}?${params.toString()}`);
    // 👀 better error handling for init_session
    if (!res.ok) {
      const text = await res.text();
      console.error('init_session error body:', text);
      throw new Error(`init_session HTTP ${res.status}`);
    }

    const data = await res.json();
    console.log('init_session', data);
    if (!data.ok) throw new Error(data.error || 'Init failed');

    participant = data.participant_id;
    localStorage.setItem('study_participant', participant);

    trials = (data.trials || []).sort((a,b)=>a.order_index-b.order_index);
    if (trials.length === 0) throw new Error('No trials returned');

    // ✅ warm up cache for first 2–3 items
    for (let k = 0; k < Math.min(3, trials.length); k++){
      const tt = trials[k];
      const a = new Image(); a.src = tt.input_url;
      const b = new Image(); b.src = tt.generalized_url;
    }

    el.welcome.classList.add('hidden');
    el.instructions.classList.remove('hidden');

  } catch(err) {
    alert('Could not start: ' + (err.message || err));
    console.error(err);
    if (startBtn) startBtn.disabled = false;
  }
});

// STEP 2: begin after reading instructions
el.begin.addEventListener('click', ()=>{
  el.instructions.classList.add('hidden');
  el.trial.classList.remove('hidden');
  idx = 0;
  startTrial(0);
});

// Ctrl/Cmd + Enter to submit
el.text.addEventListener('keydown', (e)=>{
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter'){
    e.preventDefault();
    el.submit.click();
  }
});

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
      return;
    }

    const dur = Date.now() - tStart;

    const client_meta = {
      ua: navigator.userAgent,
      first: state.first,
      last:  state.last,
      token: state.token
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

    // 👀 better error handling for submit
    if (!res.ok) {
      const text = await res.text();
      console.error('submit error body:', text);
      alert(`Server error while saving your answer (HTTP ${res.status}). Please try again.`);
      return;
    }

    const data = await res.json();
    console.log('submit response', data);
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
  } catch (err){
    // This is when fetch truly fails (offline, CORS, etc.)
    alert('Network error while submitting. Please try again.');
    console.error('submit exception', err);
  } finally {
    sending = false;
    el.submit.disabled = false;
    if (el.submitLabel) el.submitLabel.textContent = 'Submit';
    if (el.submitSpin)  el.submitSpin.classList.add('hidden');
  }
});

// Auto-fill form from previous session
window.addEventListener('DOMContentLoaded', ()=>{
  const f = localStorage.getItem('study_first'); 
  const l = localStorage.getItem('study_last');  
  const t = localStorage.getItem('study_token'); 

  if (f) { el.first.value = f; state.first = f; }
  if (l) { el.last.value  = l; state.last  = l; }
  if (t) { el.token.value = t; state.token = t; }
});
