// Speech recognition (Whisper) in a background worker, so that the page does not freeze.
// Runs entirely in the student's browser: the recording never leaves the device, only the text
// is kept (and sent to the teacher with Done).
// Library: transformers.js 3.7.6 (Apache-2.0) with the ONNX Runtime WebAssembly backend, both in vendor/transformers/.
// Model: Whisper base (OpenAI, MIT), ONNX q8 export "Xenova/whisper-base", served from docs/models/ on this site;
// if the files are not there, transformers.js downloads the same model from huggingface.co.
import { pipeline, env } from "./vendor/transformers/transformers.min.js";

env.allowLocalModels = true;
env.localModelPath = new URL("../models/", import.meta.url).href;
env.allowRemoteModels = true;
env.useBrowserCache = true;                  // downloaded once, then taken from the browser cache
env.backends.onnx.wasm.wasmPaths = new URL("./vendor/transformers/", import.meta.url).href;
env.backends.onnx.wasm.proxy = false;

let asr = null, loadedModel = "";

self.onmessage = async ({ data }) => {
  const { id, model, audio } = data;
  const post = (m) => self.postMessage({ id, ...m });
  try {
    if (!asr || loadedModel !== model) {
      post({ type: "status", text: "loading" });
      asr = await pipeline("automatic-speech-recognition", model, {
        dtype: "q8", device: "wasm",
        progress_callback: (p) => { if (p.status === "progress" && p.total) post({ type: "progress", file: p.file, loaded: p.loaded, total: p.total }); },
      });
      loadedModel = model;
    }
    post({ type: "status", text: "transcribing" });
    const out = await asr(audio, {
      language: "english", task: "transcribe",
      chunk_length_s: 30, stride_length_s: 5,
    });
    post({ type: "done", text: String(out?.text || "").replace(/\s+/g, " ").trim() });
  } catch (e) {
    post({ type: "error", message: String(e?.message || e) });
  }
};
