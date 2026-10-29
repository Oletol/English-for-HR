// Measures of students' speaking (transcripts) and writing, for the Progress page of the Teacher's Edition
// and for the CSV export used in research. Everything is computed in the teacher's browser.
import { tokens, lemma, vocabProfile } from "./writing.js?v=20261029b";
import { parseSpeakMeta, exercisesOf } from "./common.js?v=20261029b";

// Which answers are followed over time:
//  speaking – every "open" item with "speak" (recorded and turned into text);
//  writing  – "open" exercises marked track:"writing" in the course file.
export function trackedTasks(units, contentById) {
  const out = [];
  for (const u of units) {
    const c = contentById[u.id];
    if (!c) continue;
    exercisesOf(c).forEach((ex) => {
      if (ex.kind !== "open") return;
      for (const it of ex.items || []) {
        const skill = it.speak ? "speaking" : ex.track === "writing" ? "writing" : "";
        if (!skill) continue;
        out.push({ key: `${u.id}/${ex.id}/${it.id}`, unitId: u.id, unitOrder: u.order || 0, exId: ex.id, itemId: it.id,
          skill, title: ex.title || "", prompt: String(it.text || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(), sec: it.speak || 0 });
      }
    });
  }
  return out;
}

// Subordinating words: a simple, transparent index of syntactic complexity
const SUBORD = new Set(("because although though whereas while whilst unless since if when whenever where wherever whether which who whom whose that " +
  "so that once until till before after as provided").split(" "));

// Moving-average type-token ratio (Covington & McFall, 2010): does not depend on text length as plain TTR does
export function mattr(lemmas, w = 50) {
  if (!lemmas.length) return 0;
  if (lemmas.length <= w) return new Set(lemmas).size / lemmas.length;
  const cnt = new Map();
  let uniq = 0, sum = 0;
  const add = (x, d) => { const n = (cnt.get(x) || 0) + d; cnt.set(x, n); if (d > 0 && n === 1) uniq++; if (d < 0 && n === 0) uniq--; };
  for (let i = 0; i < w; i++) add(lemmas[i], 1);
  sum += uniq / w;
  for (let i = w; i < lemmas.length; i++) { add(lemmas[i], 1); add(lemmas[i - w], -1); sum += uniq / w; }
  return sum / (lemmas.length - w + 1);
}

const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

// text – the answer; fb – the writing/speaking check saved by the teacher (LanguageTool + vocabulary), if any;
// metaStr – what the recorder saved ("dur=…;words=…;take=…"); phrases – the unit vocabulary
export function measure(text, V, phrases, fb, metaStr) {
  text = String(text || "");
  const prof = vocabProfile(text, V, phrases);
  const toks = tokens(text).map((t) => t.replace(/'(s|t|ll|re|ve|d|m)$/, "")).filter(Boolean);
  const lemmas = toks.map((t) => lemma(t, V.levels));
  const words = prof.words;
  const leveled = Object.values(prof.counts).reduce((a, b) => a + b, 0) || 1;
  const meta = parseSpeakMeta(metaStr);
  const dur = Number(meta.dur) || 0;
  const sentences = Math.max(1, (text.match(/[^.!?]+[.!?]+/g) || [text]).filter((s) => s.trim()).length);
  const sub = toks.filter((t) => SUBORD.has(t)).length;
  const issues = fb && !fb.grammarError ? fb.issues || [] : null;
  const gram = issues ? issues.filter((i) => i.type === "grammar" || /grammar/i.test(i.category || "")).length : null;
  const accuracy = issues ? issues.filter((i) => !["typographical", "whitespace", "style"].includes(i.type)).length : null;
  return {
    words,
    dur,
    wpm: dur && words ? r1(words / (dur / 60)) : null,
    take: Number(meta.take) || null,
    recordedAt: meta.at || "",
    ttr: words ? r3(new Set(lemmas).size / lemmas.length) : 0,
    mattr: r3(mattr(lemmas)),
    b2plus: r1((100 * (prof.counts.B2 + prof.counts.C1 + prof.counts.C2)) / leveled),
    c1plus: r1((100 * (prof.counts.C1 + prof.counts.C2)) / leveled),
    unitPhrases: prof.unitUsed.length,
    unitPhraseList: prof.unitUsed.join("; "),
    sentLen: r1(words / sentences),
    subPer100: words ? r1((100 * sub) / words) : 0,
    ltChecked: !!issues,
    ltAll: issues ? issues.length : null,
    ltGrammar: gram,
    errPer100: issues && words ? r1((100 * accuracy) / words) : null,
    checkedText: fb?.text || "",
  };
}

// metrics shown on the page (and their direction: +1 = higher is better)
export const METRICS = [
  { id: "words", label: "Words", dir: 1 },
  { id: "wpm", label: "Words a minute (speaking)", dir: 1, skill: "speaking" },
  { id: "mattr", label: "Lexical diversity (MATTR-50)", dir: 1 },
  { id: "b2plus", label: "B2+ words, % of listed words", dir: 1 },
  { id: "unitPhrases", label: "Unit phrases used", dir: 1 },
  { id: "subPer100", label: "Subordinating words per 100 words", dir: 1 },
  { id: "sentLen", label: "Words per sentence (writing)", dir: 1, skill: "writing" },
  { id: "errPer100", label: "Errors per 100 words (after the check)", dir: -1 },
];

export const CSV_COLS = ["code", "student", "group", "skill", "unit", "task_no", "exercise", "item", "task_title", "recorded_at", "submitted",
  "words", "duration_s", "wpm", "take", "ttr", "mattr50", "b2plus_pct", "c1plus_pct", "unit_phrases", "unit_phrase_list",
  "words_per_sentence", "subordinators_per100", "lt_checked", "lt_issues_all", "lt_grammar", "errors_per100", "text", "text_at_check"];

export function toCSV(rows) {
  const q = (v) => { const s = v === null || v === undefined ? "" : String(v); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return "﻿" + [CSV_COLS.join(","), ...rows.map((r) => CSV_COLS.map((c) => q(r[c])).join(","))].join("\r\n");
}
