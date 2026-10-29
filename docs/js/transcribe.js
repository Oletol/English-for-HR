// Turns a recording (Blob) into text with Whisper, in a background worker (asr-worker.js).
// Loaded only when a student records an answer in a speaking task with a transcript.
export const ASR_MODEL_NAME = "Whisper base (q8)";
const model = () => (typeof window !== "undefined" && window.ASR_MODEL) || "Xenova/whisper-base";
const VER = new URL(import.meta.url).search;        // the same ?v= as this file, so that a new version is loaded after an update

let worker = null, seq = 0;
const pending = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./asr-worker.js" + VER, import.meta.url), { type: "module" });
  worker.onmessage = ({ data }) => pending.get(data.id)?.(data);
  worker.onerror = (e) => {
    for (const [id, f] of pending) f({ id, type: "error", message: e.message || "the speech recogniser could not start" });
    pending.clear();
    worker = null;
  };
  return worker;
}

// 16 kHz mono, as Whisper expects
async function decode(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  let ab;
  try { ab = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p?.then) p.then(res, rej); }); }
  finally { try { ctx.close(); } catch {} }
  const len = Math.max(1, Math.ceil(ab.duration * 16000));
  const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const off = new Off(1, len, 16000);
  const src = off.createBufferSource();
  src.buffer = ab;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return { audio: out.getChannelData(0), seconds: ab.duration };
}

// onStatus(text) gets short messages for the student
export async function transcribe(blob, onStatus = () => {}) {
  onStatus("Preparing the recording…");
  const { audio, seconds } = await decode(blob);
  const id = ++seq;
  const files = {};
  return new Promise((resolve, reject) => {
    pending.set(id, (m) => {
      if (m.type === "progress") {
        files[m.file] = [m.loaded, m.total];
        const l = Object.values(files).reduce((s, [a]) => s + a, 0);
        onStatus(`Downloading the speech recogniser (only the first time): ${Math.round(l / 1048576)} of about 77 MB…`);
      } else if (m.type === "status") {
        onStatus(m.text === "loading" ? "Starting the speech recogniser…" : `Turning your speech into text… (about ${Math.max(5, Math.round(seconds / 3))} seconds)`);
      } else if (m.type === "done") { pending.delete(id); resolve({ text: m.text, seconds }); }
      else if (m.type === "error") { pending.delete(id); reject(new Error(m.message)); }
    });
    getWorker().postMessage({ id, model: model(), audio }, [audio.buffer]);
  });
}
