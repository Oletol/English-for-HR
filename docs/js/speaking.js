// Speaking: timers with an in-browser voice recorder (from the msupm2 course engine).
// The recording never leaves the browser: it is kept in memory as a blob, played back here and,
// if the student wants, saved to their own computer with "Download". Reloading the page clears it.
import { registerSpeaking, esc } from "./common.js?v=20261029b";

const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const SPK = new Map();   // key -> state (survives re-rendering of the page)
const fmtT = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, "0")}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const RING = 2 * Math.PI * 14;

function speakingHTML(t, key) {
  const sec = Number(t.sec || 0), rec = t.record !== false;
  const note = t.tr
    ? `${sec ? "Record also starts the timer and stops when the time is up. " : ""}After each recording your words appear as text below (this takes a few seconds). Only the last recording is kept as text, and you cannot edit it: if you are not happy, record again. The sound itself stays in this browser.`
    : `${sec ? "Record also starts the timer. " : ""}Your recording stays in this browser: nobody else hears it, and it disappears when you reload or close the page. Use Download to keep a copy or to send it to your teacher.`;
  return `<div class="spk" data-spk="${esc(key)}" data-sec="${sec}" data-rec="${rec ? 1 : 0}"${t.tr ? ` data-tr="${esc(t.tr)}"` : ""} translate="no">
    ${t.label ? `<span class="spk-lab">${esc(t.label)}</span>` : ""}
    ${sec ? `<svg class="spk-ring" viewBox="0 0 34 34" aria-hidden="true"><circle class="bgc" cx="17" cy="17" r="14"/><circle class="fgc" cx="17" cy="17" r="14" stroke-dasharray="${RING}" stroke-dashoffset="0"/></svg>
      <span class="spk-time">${fmtT(sec)}</span>` : ""}
    <div class="spk-btns">
      ${sec ? `<button class="btn small" type="button" data-spk-act="start">Start</button><button class="btn small" type="button" data-spk-act="reset">Reset</button>` : ""}
      ${rec ? `<button class="btn small rec" type="button" data-spk-act="rec"><span class="rec-dot"></span><span class="rl">Record</span></button>` : ""}
    </div>
    ${rec ? `<div class="spk-live" hidden><span class="rec-dot"></span><span class="spk-rt">REC 00:00</span><span class="spk-meter"><i></i></span><span class="spk-quiet" hidden>No sound – check the microphone</span></div>
      <div class="spk-takes"></div><p class="spk-note">${note}</p>` : ""}
  </div>`;
}
registerSpeaking(speakingHTML);

function state(el) {
  const key = el.dataset.spk;
  if (!SPK.has(key)) SPK.set(key, { sec: +el.dataset.sec, left: +el.dataset.sec, running: false, timer: null, rec: null, stream: null, takes: [], err: "", level: 0, t0: 0, loud: false });
  return SPK.get(key);
}
const nodesOf = (key) => $$(`.spk[data-spk="${CSS.escape(key)}"]`);

function syncSpk(el) {
  const st = state(el);
  el.classList.toggle("run", st.running);
  el.classList.toggle("end", st.sec > 0 && st.left <= 0);
  const tm = el.querySelector(".spk-time");
  if (tm) tm.textContent = fmtT(st.left);
  const ring = el.querySelector(".fgc");
  if (ring) ring.setAttribute("stroke-dashoffset", String(RING * (1 - (st.sec ? st.left / st.sec : 0))));
  const sb = el.querySelector('[data-spk-act="start"]');
  if (sb) sb.textContent = st.running ? "Pause" : st.left < st.sec && st.left > 0 ? "Continue" : "Start";
  const rb = el.querySelector('[data-spk-act="rec"]');
  if (rb) { rb.classList.toggle("on", !!st.rec); rb.querySelector(".rl").textContent = st.rec ? "Stop recording" : "Record"; }
  const live = el.querySelector(".spk-live");
  if (live) {
    live.hidden = !st.rec;
    if (st.rec) {
      live.querySelector(".spk-rt").textContent = "REC " + fmtT(Math.floor((Date.now() - st.t0) / 1000));
      live.querySelector(".spk-meter i").style.width = Math.min(100, Math.round(st.level * 100)) + "%";
      live.querySelector(".spk-quiet").hidden = st.loud || Date.now() - st.t0 < 3000;
    }
  }
  const box = el.querySelector(".spk-takes");
  if (box) {
    const sig = st.takes.map((t) => t.url).join("|") + st.err;
    if (box.dataset.sig !== sig) {
      box.dataset.sig = sig;
      box.innerHTML = (st.err ? `<div class="spk-take" style="color:${/^Waiting/.test(st.err) ? "var(--mut)" : "var(--bad)"}">${esc(st.err)}</div>` : "")
        + st.takes.map((t, i) => `<div class="spk-take"><span class="tk-n">Take ${i + 1}</span><audio controls preload="metadata" src="${t.url}"></audio>
          <span class="muted" style="font-size:12px">${fmtT(Math.round(t.dur))}</span>
          <a href="${t.url}" download="${esc(t.name)}">Download</a></div>`).join("");
      box.querySelectorAll("audio").forEach(fixDuration);
    }
  }
}
const syncKey = (key) => nodesOf(key).forEach(syncSpk);

// ------------------------------------------------------------------ transcript (speaking tasks with "speak" items)
// The recording is turned into text in this browser (Whisper, see transcribe.js); the text goes into the
// read-only answer field of the item, so it is saved and sent to the teacher with Done like any other answer.
const TRS = new Map();    // "exId|itemId" -> { msg, bad, busy }
function setTrs(tr, msg, bad = false, busy = false) {
  TRS.set(tr, { msg, bad, busy });
  syncTrs(tr);
}
function syncTrs(tr) {
  const s = TRS.get(tr);
  document.querySelectorAll(`[data-trs="${CSS.escape(tr)}"]`).forEach((el) => {
    el.textContent = s ? s.msg : "";
    el.classList.toggle("bad", !!s?.bad);
    el.classList.toggle("busy", !!s?.busy);
  });
}
const field = (ex, item) => document.querySelector(`[data-ex="${CSS.escape(ex)}"][data-item="${CSS.escape(item)}"]`);
let trQueue = Promise.resolve();
function startTranscript(tr, blob, dur, take) {
  setTrs(tr, "Your recording is waiting to be turned into text…", false, true);
  trQueue = trQueue.then(async () => {
    try {
      const { transcribe, ASR_MODEL_NAME } = await import("./transcribe.js?v=20261029b");
      const { text } = await transcribe(blob, (m) => setTrs(tr, m, false, true));
      const [ex, item] = tr.split("|");
      if (!text) { setTrs(tr, "No words were recognised. Check the microphone, speak a little closer and record again.", true); return; }
      const ta = field(ex, item), meta = field(ex, item + "~m");
      if (!ta || ta.disabled) { setTrs(tr, "The exercise is closed, so the new text was not saved.", true); return; }
      ta.value = text;
      ta.dispatchEvent(new Event("input", { bubbles: true }));
      if (meta) {
        const words = (text.match(/[A-Za-z]+(?:'[a-z]+)?/g) || []).length;
        meta.value = `dur=${Math.round(dur)};words=${words};take=${take};model=${ASR_MODEL_NAME};at=${new Date().toISOString()}`;
        meta.dispatchEvent(new Event("input", { bubbles: true }));
      }
      setTrs(tr, `✓ Recording ${take} is now text (${Math.round(dur)} seconds). Not happy? Record again. When you are ready, click Done.`);
    } catch (e) {
      console.warn(e);
      setTrs(tr, "Your speech could not be turned into text in this browser (" + (e?.message || "error") + "). Try Google Chrome on a computer. You can also download the recording and send it to your teacher.", true);
    }
  });
}

function tick(key) {
  const st = SPK.get(key);
  st.left -= 1;
  if (st.left <= 0) {
    st.left = 0; stopTimer(st); beep();
    if (st.rec) stopRec(key);
  }
  syncKey(key);
}
function startTimer(key) {
  const st = SPK.get(key);
  if (!st.sec || st.running) return;
  if (st.left <= 0) st.left = st.sec;
  st.running = true;
  st.timer = setInterval(() => tick(key), 1000);
}
function stopTimer(st) { st.running = false; clearInterval(st.timer); st.timer = null; }

async function spkAction(b) {
  const el = b.closest(".spk"), key = el.dataset.spk, st = state(el), act = b.dataset.spkAct;
  if (act === "start") { st.running ? stopTimer(st) : startTimer(key); }
  if (act === "reset") { stopTimer(st); st.left = st.sec; if (st.rec) stopRec(key); }
  if (act === "rec") {
    try { st.rec ? stopRec(key) : await startRec(key); }
    catch (e) {
      st.stream?.getTracks().forEach((t) => t.stop()); st.stream = null; stopMeter(st); st.rec = null;
      st.err = "The recording could not start (" + (e?.name || e?.message || "error") + "). Please reload the page and try again, or use Google Chrome.";
    }
  }
  syncKey(key);
}

// Safari records reliably only in mp4; Chrome and Firefox in webm / ogg
const IS_SAFARI = /^((?!chrome|chromium|crios|android|edg).)*safari/i.test(navigator.userAgent);
function typeList() {
  if (typeof MediaRecorder === "undefined") return null;
  const all = IS_SAFARI ? ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"] : ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return [...all.filter((t) => { try { return MediaRecorder.isTypeSupported?.(t); } catch { return false; } }), ""];
}
// A recorder that really starts: the formats are tried one by one, because some browsers
// say a format is "supported" and then refuse to record in it. Before this fix such a refusal
// stopped everything silently: the microphone was on, but nothing was recorded.
function makeRecorder(stream) {
  let last = null;
  for (const type of typeList()) {
    try {
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      rec.start(1000);
      return { rec, type };
    } catch (e) { last = e; }
  }
  throw last || new Error("MediaRecorder");
}
async function startRec(key) {
  const st = SPK.get(key);
  st.err = "";
  if (typeList() === null || !navigator.mediaDevices?.getUserMedia) { st.err = "This browser cannot record sound. Please try Chrome, Edge, Firefox or Safari."; return; }
  if (!window.isSecureContext) { st.err = "Recording works only on a secure (https) page."; return; }
  try {
    const p = await navigator.permissions?.query?.({ name: "microphone" });
    if (p && p.state === "denied") {
      st.err = "The browser is not allowed to use the microphone. Click the icon on the left of the address bar and allow the microphone for this site. On a Mac, also check System Settings, Privacy & Security, Microphone: the switch for your browser must be on. Then reload the page.";
      return;
    }
  } catch {}
  st.err = "Waiting for the microphone… If the browser asks for permission (near the address bar), click Allow.";
  syncKey(key);
  try {
    st.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    const n = e && e.name;
    st.err = n === "NotAllowedError" || n === "SecurityError"
      ? "The browser is not allowed to use the microphone. Click the icon on the left of the address bar and allow the microphone for this site. On a Mac, also check System Settings, Privacy & Security, Microphone: the switch for your browser must be on. Then reload the page."
      : n === "NotFoundError" || n === "OverconstrainedError"
        ? "No microphone was found. Connect a microphone or headset and try again."
        : n === "NotReadableError" || n === "AbortError"
          ? "The microphone is busy or cannot be started. Close other programs that use it (Zoom, Teams, Telegram calls) and try again."
          : "The microphone could not be started (" + (n || "unknown error") + "). Try another browser: Chrome, Safari, Edge or Firefox.";
    return;
  }
  st.err = "";
  let made;
  try { made = makeRecorder(st.stream); } catch (e) {
    st.stream.getTracks().forEach((t) => t.stop()); st.stream = null;
    st.err = "The browser opened the microphone but could not record (" + (e?.name || "error") + "). Please try Google Chrome.";
    return;
  }
  const { rec, type } = made;
  startMeter(st, key);
  const chunks = [];
  const t0 = Date.now();
  st.t0 = t0; st.loud = false;
  let saved = false;
  const save = () => {
    if (saved) return;
    saved = true;
    const mime = (rec.mimeType || type || "audio/webm").split(";")[0];
    const blob = new Blob(chunks, { type: mime });
    const ext = /mp4/.test(mime) ? "m4a" : /ogg/.test(mime) ? "ogg" : "webm";
    if (blob.size) {
      const url = URL.createObjectURL(blob);
      const dur = (Date.now() - t0) / 1000;
      st.takes.push({ url, dur, name: `speaking-${key}-take${st.takes.length + 1}.${ext}` });
      const tr = nodesOf(key)[0]?.dataset.tr;
      if (tr) startTranscript(tr, blob, dur, st.takes.length);
    } else st.err = "The recording is empty: the microphone sent no sound. Check which microphone the browser uses (the icon in the address bar) and try again.";
    stopMeter(st);
    st.stream?.getTracks().forEach((t) => t.stop());
    st.stream = null;
    syncKey(key);
  };
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.onstop = () => setTimeout(save, 50);          // the last piece of data may come just after "stop"
  rec.onerror = (e) => { st.err = "Recording stopped because of an error (" + (e?.error?.name || "error") + "). Please try again or use Google Chrome."; save(); };
  st.save = save;
  st.rec = rec;
  if (st.sec && !st.running) startTimer(key);
}
// live input level, so that the student can see that the microphone really hears them
function startMeter(st, key) {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === "suspended") actx.resume();
    // the level meter listens to a copy of the stream, so that it never takes the sound away from the recorder
    st.meterStream = st.stream.clone ? st.stream.clone() : st.stream;
    const src = actx.createMediaStreamSource(st.meterStream);
    const an = actx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    st.meter = { src, an, iv: setInterval(() => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128) / 128);
      st.level = st.level * 0.6 + peak * 2.5 * 0.4;
      if (peak > 0.04) st.loud = true;
      syncKey(key);
    }, 120) };
  } catch { st.meter = null; }
}
function stopMeter(st) {
  if (!st.meter) return;
  clearInterval(st.meter.iv);
  try { st.meter.src.disconnect(); } catch {}
  if (st.meterStream && st.meterStream !== st.stream) st.meterStream.getTracks().forEach((t) => t.stop());
  st.meterStream = null;
  st.meter = null; st.level = 0;
}
// Chrome writes webm files without a duration: the player shows 0:00 until the end. Find the real length.
function fixDuration(a) {
  a.addEventListener("loadedmetadata", function f() {
    if (a.duration === Infinity || isNaN(a.duration)) {
      a.currentTime = 1e7;
      a.addEventListener("timeupdate", function g() { a.removeEventListener("timeupdate", g); a.currentTime = 0; }, { once: true });
    }
    a.removeEventListener("loadedmetadata", f);
  });
}

function stopRec(key) {
  const st = SPK.get(key);
  if (!st?.rec) return;
  const rec = st.rec, save = st.save;
  try { rec.requestData?.(); } catch {}
  try { rec.stop(); } catch { save?.(); }
  setTimeout(() => save?.(), 2500);                    // in case the browser never reports "stop"
  st.rec = null;
  if (st.running) stopTimer(st);
}

let actx = null;
function beep() {
  try {
    actx ??= new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = 880; g.gain.value = 0.08;
    o.connect(g); g.connect(actx.destination);
    o.start(); o.stop(actx.currentTime + 0.35);
  } catch {}
}

document.addEventListener("click", (e) => {
  const b = e.target.closest?.("[data-spk-act]");
  if (b) { e.preventDefault(); e.stopPropagation(); spkAction(b); }
}, true);
// after the page has been drawn again, restore the timers' state (but not after our own updates)
let pending = false;
new MutationObserver((ms) => {
  if (pending || !ms.some((m) => m.target.nodeType === 1 && !m.target.closest(".spk"))) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; $$(".spk").forEach(syncSpk); for (const tr of TRS.keys()) syncTrs(tr); });
}).observe(document.documentElement, { childList: true, subtree: true });
