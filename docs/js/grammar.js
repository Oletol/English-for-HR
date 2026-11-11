// Grammar in students' texts and transcripts, without any server:
//  1. learnerIssues(text) – mistakes typical of learners whose first language is Russian (course rules,
//     shown together with LanguageTool and Harper);
//  2. findGrammar(text, ids) – the unit's grammar structures the student used (passive, infinitive forms…),
//     with examples, for the feedback and for Speaking / Writing progress.
// Both work on the words only, so they are approximate; every rule is listed below, so the teacher (and a reader
// of an article) can see exactly what is counted.

// ------------------------------------------------------------------ past participles
const IRREG_PP = new Set(("been done gone got gotten made said taken come seen known given found thought told become left felt brought begun kept held " +
  "written stood heard let meant set met run paid sat spoken led read grown lost fallen sent built understood drawn broken spent cut risen " +
  "driven bought worn chosen sought thrown caught dealt won forgotten taught sold fought eaten slept flown drunk forgiven hidden shaken " +
  "stolen woken fed hung shot lit bitten stuck lent bent sworn torn frozen put shut hit hurt cost quit spread split burst bound wound " +
  "undertaken overtaken mistaken withdrawn overcome undergone forbidden arisen beaten born borne bred dug fled flung ground knelt laid " +
  "leant learnt overheard overseen proven ridden rung shown shrunk slid spat spun sprung stung strode struck strung swept swung sworn " +
  "thrust trodden upheld upset withheld woven wept outdone misled misunderstood rewritten rebuilt forecast broadcast").split(" "));
// past simple forms that are NOT participles (used after have / be by mistake)
const PAST_NOT_PP = { went: "gone", took: "taken", gave: "given", wrote: "written", spoke: "spoken", saw: "seen", knew: "known",
  chose: "chosen", began: "begun", broke: "broken", came: "come", drove: "driven", ate: "eaten", fell: "fallen", flew: "flown",
  forgot: "forgotten", grew: "grown", hid: "hidden", rose: "risen", shook: "shaken", stole: "stolen", threw: "thrown", wore: "worn",
  drew: "drawn", did: "done", became: "become", ran: "run", undertook: "undertaken", withdrew: "withdrawn", overcame: "overcome", forgave: "forgiven" };
// -ed words that are not verbs, and participles that work as adjectives (not counted as passive)
const NOT_PP = new Set(("need indeed bed red seed speed feed hundred breed greed shed sled weed deed proceed exceed succeed " +
  "interested tired bored excited worried pleased surprised scared annoyed amazed married supposed used tied naked wicked sacred " +
  "kindred hatred beloved aged learned skilled talented gifted bearded crooked rugged ragged wretched").split(" "));
export function isPP(w) {
  w = w.toLowerCase();
  if (NOT_PP.has(w)) return false;
  if (IRREG_PP.has(w)) return true;
  return w.length > 4 && /ed$/.test(w);
}

// ------------------------------------------------------------------ the unit's grammar structures
// Each structure: a label for students, a short description for the teacher, and a test on the list of words.
// w = words (lower case), i = position. A structure returns the length of the match (0 = no match).
const BE = new Set("am is are was were be been being 's 're".split(" "));
const MODAL = new Set("can could may might must should will would shall ought".split(" "));
const ADV = new Set("not never always often usually also just already still rarely seldom sometimes widely generally commonly officially clearly easily quickly finally recently n't".split(" "));
const skipAdv = (w, i) => { let k = i; while (k < w.length && ADV.has(w[k])) k++; return k; };
// "be + participle"; returns the index after the participle or 0
function beParticiple(w, i) {
  const k = skipAdv(w, i);
  return k < w.length && isPP(w[k]) ? k + 1 : 0;
}

export const STRUCTURES = {
  "passive-present": { label: "Present passive (is / are + V3)", test(w, i) {
    if (!["am", "is", "are", "'s", "'re"].includes(w[i])) return 0;
    if (w[i + 1] === "being" || w[i + 1] === "going") return 0;
    const e = beParticiple(w, i + 1); return e ? e - i : 0; } },
  "passive-past": { label: "Past passive (was / were + V3)", test(w, i) {
    if (!["was", "were"].includes(w[i]) || w[i + 1] === "being") return 0;
    const e = beParticiple(w, i + 1); return e ? e - i : 0; } },
  "passive-perfect": { label: "Perfect passive (has / have / had been + V3)", test(w, i) {
    if (!["has", "have", "had", "'ve", "'s", "'d"].includes(w[i])) return 0;
    const k = skipAdv(w, i + 1); if (w[k] !== "been") return 0;
    const e = beParticiple(w, k + 1); return e ? e - i : 0; } },
  "passive-continuous": { label: "Continuous passive (is / was being + V3)", test(w, i) {
    if (!["am", "is", "are", "was", "were", "'s", "'re"].includes(w[i]) || w[i + 1] !== "being") return 0;
    const e = beParticiple(w, i + 2); return e ? e - i : 0; } },
  "passive-modal": { label: "Passive after a modal verb (can / must / should / will be + V3)", test(w, i) {
    if (!MODAL.has(w[i])) return 0;
    let k = skipAdv(w, i + 1); if (w[k] !== "be") return 0;
    const e = beParticiple(w, k + 1); return e ? e - i : 0; } },
  "passive-get": { label: "get-passive (get / got + V3)", test(w, i) {
    if (!["get", "gets", "got", "getting", "gotten"].includes(w[i])) return 0;
    const e = beParticiple(w, i + 1); return e ? e - i : 0; } },
  "inf-passive": { label: "Passive infinitive (to be + V3)", test(w, i) {
    if (w[i] !== "to" || w[i + 1] !== "be") return 0;
    const e = beParticiple(w, i + 2); return e ? e - i : 0; } },
  "inf-perfect": { label: "Perfect infinitive (to have + V3)", test(w, i) {
    if (w[i] !== "to" || w[i + 1] !== "have") return 0;
    const k = skipAdv(w, i + 2);
    return k < w.length && (isPP(w[k]) || w[k] === "been") ? k + 1 - i : 0; } },
  "modal-perfect": { label: "Modal + perfect infinitive (may / must / should have + V3)", test(w, i) {
    if (!MODAL.has(w[i]) && w[i] !== "couldn't" && w[i] !== "shouldn't") return 0;
    let k = skipAdv(w, i + 1); if (w[k] !== "have" && w[k] !== "'ve") return 0;
    k = skipAdv(w, k + 1);
    return k < w.length && (isPP(w[k]) || w[k] === "been") ? k + 1 - i : 0; } },
  "inf-continuous": { label: "Continuous infinitive (to be + -ing)", test(w, i) {
    if (w[i] !== "to" || w[i + 1] !== "be") return 0;
    return /..ing$/.test(w[i + 2] || "") && w[i + 2] !== "being" ? 3 : 0; } },
  "complex-subject": { label: "Complex subject (is said / believed / expected / thought to…)", test(w, i) {
    if (!BE.has(w[i])) return 0;
    const k = skipAdv(w, i + 1);
    return /^(said|believed|expected|thought|known|reported|considered|supposed|understood|assumed|estimated|found|seen|heard|claimed|alleged|rumoured)$/.test(w[k] || "")
      && w[k + 1] === "to" && !/^(the|a|an|his|her|their|our|my|your|its|this|that|these|those|me|him|them|us|whom|be)$/.test(w[k + 2] || "the") ? k + 2 - i : 0; } },
  "likely-to": { label: "be likely / unlikely / sure / bound to…", test(w, i) {
    if (!BE.has(w[i])) return 0;
    const k = skipAdv(w, i + 1);
    return /^(likely|unlikely|sure|certain|bound|due)$/.test(w[k] || "") && w[k + 1] === "to" ? k + 2 - i : 0; } },
  "seem-to": { label: "tend / seem / appear / happen to…", test(w, i) {
    return /^(tend|tends|tended|seem|seems|seemed|appear|appears|appeared|happen|happens|happened)$/.test(w[i]) && w[i + 1] === "to" && !/^(the|a|an|me|him|her|us|them|be)$/.test(w[i + 2] || "x") ? 2 : 0; } },
  "purpose": { label: "Infinitive of purpose (in order to / so as to)", test(w, i) {
    if (w[i] === "in" && w[i + 1] === "order" && w[i + 2] === "to") return 3;
    if (w[i] === "so" && w[i + 1] === "as" && w[i + 2] === "to") return 3;
    return 0; } },
  "object-inf": { label: "Verb + object + to-infinitive (want / expect / encourage someone to…)", test(w, i) {
    if (!/^(want|wants|wanted|expect|expects|expected|encourage|encourages|encouraged|allow|allows|allowed|ask|asks|asked|persuade|persuades|persuaded|invite|invites|invited|enable|enables|enabled|urge|urges|urged|advise|advises|advised|tell|tells|told|require|requires|required|force|forces|forced)$/.test(w[i])) return 0;
    const obj = w[i + 1] || "";
    const pron = /^(me|you|him|her|us|them|it|people|employees|staff|everyone|everybody)$/.test(obj);
    if (pron && w[i + 2] === "to" && w[i + 3] && w[i + 3] !== "the") return 4;
    if (/^(the|our|their|his|her|my|your|all|new|some)$/.test(obj)) {
      for (let k = i + 2; k < Math.min(i + 5, w.length - 1); k++) if (w[k] === "to" && w[k + 1] && !/^(the|a|an)$/.test(w[k + 1])) return k + 2 - i;
    }
    return 0; } },
  "too-enough": { label: "too… to / …enough to", test(w, i) {
    if (w[i] === "too" && w[i + 2] === "to") return 3;
    if (w[i + 1] === "enough" && w[i + 2] === "to") return 3;
    return 0; } },
  // other units: past tenses, conditionals, modals – the same mechanism
  "past-perfect": { label: "Past perfect (had + V3)", test(w, i) {
    if (w[i] !== "had" && w[i] !== "'d") return 0;
    const k = skipAdv(w, i + 1);
    return k < w.length && w[k] !== "been" && (isPP(w[k])) ? k + 1 - i : 0; } },
  "past-continuous": { label: "Past continuous (was / were + -ing)", test(w, i) {
    return (w[i] === "was" || w[i] === "were") && /..ing$/.test(w[skipAdv(w, i + 1)] || "") && w[skipAdv(w, i + 1)] !== "being" ? skipAdv(w, i + 1) + 1 - i : 0; } },
  "used-to": { label: "used to / would for past habits", test(w, i) {
    return w[i] === "used" && w[i + 1] === "to" && w[i - 1] !== "be" && !BE.has(w[i - 1] || "") && !/..ing$/.test(w[i + 2] || "") ? 2 : 0; } },
};

// Groups that can be named in the course file instead of single structures
export const GRAMMAR_SETS = {
  passive: ["passive-present", "passive-past", "passive-perfect", "passive-continuous", "passive-modal", "passive-get", "inf-passive"],
  infinitive: ["inf-passive", "inf-perfect", "inf-continuous", "modal-perfect", "complex-subject", "likely-to", "seem-to", "purpose", "object-inf", "too-enough"],
};
export function expandGrammar(ids) {
  const out = [];
  for (const id of ids || []) for (const x of GRAMMAR_SETS[id] || [id]) if (STRUCTURES[x] && !out.includes(x)) out.push(x);
  return out;
}

// words with their positions in the text, for examples
function words(text) {
  const out = [];
  const re = /[A-Za-z]+(?:['’][a-z]+)?|['’](?:s|re|ve|d|ll)\b/g;
  let m;
  while ((m = re.exec(text))) {
    let t = m[0].toLowerCase().replace(/’/g, "'");
    // split "it's" into "it" + "'s", "they've" into "they" + "'ve", "isn't" into "is" + "n't"
    const c = t.match(/^([a-z]+?)(n't|'s|'re|'ve|'d|'ll)$/);
    if (c) {
      out.push({ t: c[1] === "ca" ? "can" : c[1] === "wo" ? "will" : c[1], s: m.index, e: m.index + c[1].length });
      out.push({ t: c[2] === "'ll" ? "will" : c[2], s: m.index + c[1].length, e: m.index + t.length });
    } else out.push({ t, s: m.index, e: m.index + t.length });
  }
  return out;
}

// [{id, label, count, examples:[…]}] for every structure in ids (also those with count 0)
export function findGrammar(text, ids) {
  text = String(text || "");
  const list = expandGrammar(ids);
  if (!list.length) return [];
  const W = words(text), w = W.map((x) => x.t);
  return list.map((id) => {
    const S = STRUCTURES[id];
    const ex = [];
    for (let i = 0; i < w.length; i++) {
      const n = S.test(w, i);
      if (n > 0) { ex.push(text.slice(W[i].s, W[Math.min(i + n, W.length) - 1].e)); i += n - 1; }
    }
    return { id, label: S.label, count: ex.length, examples: ex.slice(0, 6) };
  });
}

// ------------------------------------------------------------------ course rules: typical learner mistakes
// Each rule: a regular expression on the text and a message; "fix" builds a suggestion from the match.
const SUBJ3 = "he|she|it|everyone|everybody|nobody|the manager|the director|my boss|the boss";
const BASEV = "depend|think|want|need|know|like|make|take|mean|seem|have|do|go|say|work|help|show|give|try|tend|prefer|agree|believe|feel|look|involve|require|include|allow|lead|cause";
const ADJ_BE = "afraid|ready|sure|able|unable|responsible|interested|aware|happy|unhappy|willing|reluctant|likely|unlikely|right|wrong|late|busy|tired|ashamed|proud|angry";
const REGV = "discuss|use|inform|share|ask|invite|offer|involve|encourage|support|establish|require|expect|consider|publish|approve|review|train|hire|employ|promote|evaluate|organise|organize|introduce|explain|describe|develop|create|design|change|accept|reject|base|include|provide|allow|interview|recruit|select|appoint|dismiss|reward|praise|criticise|criticize|ignore|interrupt|follow|treat|respect|achieve|solve|resolve|announce|collect|analyse|analyze|prepare|deliver|perceive|reinforce|influence|affect";
const UNCOUNT = { informations: "information", advices: "advice", knowledges: "knowledge", feedbacks: "feedback", equipments: "equipment", evidences: "evidence", furnitures: "furniture", researches: "research", homeworks: "homework", progresses: "progress" };
const RULES = [
  { re: /\b(I|we|they|you)\s+(am|are|'m|'re)\s+(agree|disagree)\b/gi, msg: "Agree is a verb in English: say “I agree”, not “I am agree”.", fix: (m) => [`${m[1]} ${m[3]}`] },
  { re: /\b(he|she|it|this)\s+(is|'s)\s+(agree|disagree)\b/gi, msg: "Agree is a verb: “she agrees”, not “she is agree”.", fix: (m) => [`${m[1]} ${m[3]}s`] },
  { re: /\b(explain|explains|explained|explaining|describe|describes|described|suggest|suggests|suggested|say|says|said)\s+(me|us|him|her|them)\b(?!\s+(?:to|that|how|why|what|where|when|if|whether)\b)/gi,
    msg: "After explain, describe, suggest and say the person needs “to”: explain something to me, explain to us how…", fix: (m) => [`${m[1]} to ${m[2]}`] },
  { re: /\b(suggest|suggests|suggested|suggesting|recommend|recommends|recommended|propose|proposes|proposed)\s+(to)\s+(?!(?:the|a|an|me|him|her|us|them|my|our|their|his|your|its|this|that|everyone|management|staff|employees|colleagues|members)\b)([a-z]+)/gi,
    msg: "Suggest / recommend + -ing or + that: “suggested discussing it”, “suggested that we discuss it”.", fix: (m) => [`${m[1]} ${ing(m[3])}`, `${m[1]} that we ${m[3]}`] },
  { re: /\b(discuss|discussed|discusses|discussing)\s+about\b/gi, msg: "Discuss takes a direct object: “discuss the problem”, not “discuss about”.", fix: (m) => [m[1]] },
  { re: /\b(depend|depends|depended|depending)\s+(from|of)\b/gi, msg: "Depend on, not depend from / of.", fix: (m) => [`${m[1]} on`] },
  { re: /\b(consist|consists|consisted)\s+(from|in)\b(?!\s+(?:doing|making|helping|[a-z]+ing))/gi, msg: "Consist of (be made up of), not consist from.", fix: (m) => [`${m[1]} of`] },
  { re: new RegExp(`\\b(is|are|was|were|be|been)\\s+(consist|consists|depend|depends|belong|belongs|happen|happened|appear|appeared|occur|occurred|arrive|arrived|exist|existed|disappear|disappeared|seem|seemed|remain|remained)\\b`, "gi"),
    msg: "This verb has no passive and needs no “be”: “The team consists of…”, “It happened yesterday”, “The problem appeared…”.",
    fix: (m) => { const v = m[2].toLowerCase(); if (/ed$/.test(v)) return [v]; const b = v.replace(/s$/, ""); return [/^(is|was)$/i.test(m[1]) ? (/^was$/i.test(m[1]) ? ed(b) : s3(b)) : /^(were)$/i.test(m[1]) ? ed(b) : b]; } },
  { re: new RegExp(`\\b(is|are|was|were|be|been|being)\\s+(${REGV})\\b(?!\\s+(?:of|for)\\b)`, "gi"),
    msg: "Passive voice: be + past participle (V3) – “was discussed”, “are informed”.", fix: (m) => [`${m[1]} ${ed(m[2])}`] },
  { re: /\b(has|have|had|'ve|is|are|was|were|be|been|being)\s+(went|took|gave|wrote|spoke|saw|knew|chose|began|broke|came|drove|ate|fell|flew|forgot|grew|hid|rose|shook|stole|threw|wore|drew|did|became|ran|undertook|withdrew|overcame|forgave)\b/gi,
    msg: "After have / be use the past participle (V3): “has gone”, “was taken”, “were given”.", fix: (m) => [`${m[1]} ${PAST_NOT_PP[m[2].toLowerCase()]}`] },
  { re: /\b(didn't|did not|doesn't|does not|don't|do not|can't|cannot|couldn't|won't|will not|must|should|can|could|may|might|would)\s+(went|took|gave|wrote|spoke|saw|knew|chose|began|broke|came|said|told|made|had|found|thought|felt|brought|kept|left|sent|got|paid|met|wanted|needed|asked|worked|decided|agreed|tried|shared|explained|discussed)\b/gi,
    msg: "After did / does / do and modal verbs use the base form of the verb: “didn't go”, “can share”.", fix: (m) => [`${m[1]} ${base(m[2])}`] },
  { re: new RegExp(`\\b(${SUBJ3})\\s+(${BASEV})\\b`, "gi"),
    msg: "Present simple, third person (he / she / it): add -s – “it depends”, “she thinks”.", fix: (m) => [`${m[1]} ${s3(m[2])}`],
    skip: (t, i) => /\b(will|can|could|may|might|must|should|would|to|did|does|do|let|lets|make|makes|made|help|helps|helped|see|saw|seen|watch|watched|have|had|has)\s+$/i.test(t.slice(Math.max(0, i - 20), i)) },
  { re: new RegExp(`\\b(people|they|we|I|you|he|she|it|employees|workers|staff|managers|colleagues|students)\\s+(${ADJ_BE})\\s+(to|of|for|about|that|with)\\b`, "gi"),
    msg: "The verb “be” is missing: “people are afraid to…”, “she is ready to…”.", fix: (m) => [`${m[1]} ${beFor(m[1])} ${m[2]} ${m[3]}`],
    skip: (t, i) => /\b(make|makes|made|keep|keeps|kept|find|finds|found|feel|feels|felt|seem|seems|seemed|become|becomes|became|get|gets|got)\s+$/i.test(t.slice(Math.max(0, i - 14), i)) },
  { re: /\bthere\s+(is|was|'s)\s+(many|several|a lot of|lots of|few|a few|numerous|various|two|three|four|five|some)\s+([a-z]+s)\b/gi,
    msg: "With a plural noun: “there are many reasons”, “there were several problems”.", fix: (m) => [`there ${/was/i.test(m[1]) ? "were" : "are"} ${m[2]} ${m[3]}`] },
  { re: /\b(every|each)\s+(employees|workers|members|managers|people|colleagues|students|candidates|departments|teams)\b/gi,
    msg: "Every / each + a singular noun: “every employee”, “each member”.", fix: (m) => [`${m[1]} ${m[2] === "people" ? "person" : m[2].replace(/s$/, "")}`] },
  { re: /\b(let|lets|make|makes|made|making|help|helps|helped)\s+(me|him|her|us|them|people|employees|the staff|everyone)\s+to\s+([a-z]+)/gi,
    msg: "After let and make (+ object) the infinitive has no “to”: “let him go”, “made them wait”.", fix: (m) => [`${m[1]} ${m[2]} ${m[3]}`],
    skip: (t, i, m) => /^help/i.test(m[1]) },
  { re: /\b(want|wants|wanted|would like|expect|expects|expected)\s+that\s+(you|he|she|they|we|people|employees|the staff|him|her|them)\b/gi,
    msg: "Want / expect + object + to-infinitive: “I want you to explain it”, not “I want that you…”.", fix: (m) => [`${m[1]} ${obj(m[2])} to…`] },
  { re: /\b(tend|tends|tended|seem|seems|seemed|(?:is|are|was|were|be)\s+(?:more\s+|less\s+|very\s+|quite\s+)?(?:un)?likely)\s+to\s+([a-z]+ing)\b/gi,
    msg: "After tend to / seem to / be likely to use the base form: “likely to disclose”, not “likely to disclosing”.", fix: () => [],
    skip: (t, i, m) => /^(being|bring|sing|ring|swing|thing|king|spring)$/i.test(m[2]) },
  { re: /\b(is|are|was|were)\s+(said|believed|expected|thought|known|reported|considered)\s+that\b/gi, msg: "Check the structure: “It is said that he…” or “He is said to…”. A person cannot be said “that”.", fix: () => [], onlyIf: (t, i) => !/\bit\s+$/i.test(t.slice(Math.max(0, i - 4), i)) },
  { re: /\b(have|has)\s+(seen|met|done|finished|sent|signed|discussed|talked|spoken|received)\s+[^.!?,;]{0,25}\b(yesterday|last (?:week|month|year|monday|tuesday|wednesday|thursday|friday)|ago|in (?:19|20)\d\d)\b/gi,
    msg: "With a finished time (yesterday, last week, ago, in 2020) use the past simple, not the present perfect.", fix: () => [],
    onlyIf: (t, i, m) => !/\b(who|which|that|when|since|before|after)\b/i.test(m[0]) },
  { re: /\baccording to (me|my opinion)\b/gi, msg: "Say “in my opinion” or “I think”; “according to” introduces someone else's view or a source.", fix: () => ["in my opinion"] },
  { re: /\b(do|does|did|doing|done)\s+(a|the|this|that|many|several|some|no|any)?\s*(mistake|mistakes|decision|decisions|progress|effort|conclusion|conclusions)\b/gi,
    msg: "Collocation: make a mistake, make a decision, make progress, make an effort, draw a conclusion.", fix: (m) => [`${makeForm(m[1])}${m[2] ? " " + m[2] : ""} ${m[3]}`] },
  { re: /\bin the end of\b/gi, msg: "At the end of (a meeting, the month); “in the end” means “finally”.", fix: () => ["at the end of"] },
  { re: /\bthe most of\b/gi, msg: "Most of the… (without “the” before most).", fix: () => ["most of"] },
  { re: /\b(more|less)\s+([a-z]+er)\b/gi, msg: "Use one comparative: “easier” or “more difficult”, not “more easier”.", fix: (m) => [m[2]],
    onlyIf: (t, i, m) => /^(easier|better|worse|bigger|smaller|harder|faster|cheaper|higher|lower|simpler|stronger|weaker|larger|longer|shorter|quicker|clearer|safer|wider|closer|greater)$/i.test(m[2]) },
  { re: /\b(employees|workers|people|colleagues|managers|candidates|students|members|those)\s+(which)\b/gi, msg: "For people use “who” (or “that”), not “which”.", fix: (m) => [`${m[1]} who`] },
  { re: new RegExp(`\\b(${Object.keys(UNCOUNT).join("|")})\\b`, "gi"), msg: "This noun is uncountable in English: no plural (information, advice, feedback…).", fix: (m) => [UNCOUNT[m[1].toLowerCase()]] },
];
function ing(v) { v = v.toLowerCase(); if (/ie$/.test(v)) return v.slice(0, -2) + "ying"; if (/[^e]e$/.test(v)) return v.slice(0, -1) + "ing"; return v + "ing"; }
function ed(v) { v = v.toLowerCase(); if (/e$/.test(v)) return v + "d"; if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ied"; if (/^(plan|stop|ban|drop|ship)$/.test(v)) return v + v.slice(-1) + "ed"; return v + "ed"; }
const BASE = { went: "go", took: "take", gave: "give", wrote: "write", spoke: "speak", saw: "see", knew: "know", chose: "choose", began: "begin", broke: "break",
  came: "come", said: "say", told: "tell", made: "make", had: "have", found: "find", thought: "think", felt: "feel", brought: "bring", kept: "keep", left: "leave",
  sent: "send", got: "get", paid: "pay", met: "meet" };
function base(v) { v = v.toLowerCase(); if (BASE[v]) return BASE[v]; if (/ied$/.test(v)) return v.slice(0, -3) + "y"; if (/(ared|ided|ated|ured|ized|ised|ved|ged|ced|sed)$/.test(v) && !/ssed$/.test(v)) return v.slice(0, -1); return v.replace(/ed$/, ""); }
function s3(v) { v = v.toLowerCase(); if (v === "have") return "has"; if (v === "do" || v === "go") return v + "es"; if (/[^aeiou]y$/.test(v)) return v.slice(0, -1) + "ies"; if (/(s|sh|ch|x)$/.test(v)) return v + "es"; return v + "s"; }
function beFor(s) { s = s.toLowerCase(); return s === "i" ? "am" : /^(he|she|it)$/.test(s) ? "is" : "are"; }
function obj(s) { return { he: "him", she: "her", they: "them", we: "us" }[s.toLowerCase()] || s; }
function makeForm(d) { return { do: "make", does: "makes", did: "made", doing: "making", done: "made" }[d.toLowerCase()] || "make"; }

export function learnerIssues(text) {
  text = String(text || "");
  const out = [];
  for (const r of RULES) {
    r.re.lastIndex = 0;
    let m;
    while ((m = r.re.exec(text))) {
      if (r.skip && r.skip(text, m.index, m)) continue;
      if (r.onlyIf && !r.onlyIf(text, m.index, m)) continue;
      out.push({ offset: m.index, length: m[0].length, message: r.msg, short: "", fix: (r.fix(m) || []).slice(0, 2), type: "grammar", category: "Course rules", src: "course" });
    }
  }
  return out;
}

// ------------------------------------------------------------------ vocabulary level of a text
// The lowest CEFR level that covers at least 95% of the words found in the lists (lexical coverage).
export function textLevel(counts) {
  const L = ["A1", "A2", "B1", "B2", "C1", "C2"];
  const total = L.reduce((n, l) => n + (counts?.[l] || 0), 0);
  if (!total) return "";
  let acc = 0;
  for (const l of L) { acc += counts[l] || 0; if (acc / total >= 0.95) return l; }
  return "C2";
}
