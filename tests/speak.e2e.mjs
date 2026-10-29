// Recorded speaking with a transcript (Whisper in the browser), the Writing section and the Progress page,
// on the mock Firebase with the real course.json.
// Needs: docs/models/Xenova/whisper-base (on the site) and tests/_speech-sample.webm (16 s of speech).
// Run: python3 -m http.server 5055 -d docs &  node tests/speak.e2e.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:5055";
const SHOTS = process.env.SHOTS || "/tmp/shots-speak";
mkdirSync(SHOTS, { recursive: true });
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const courseText = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const course = JSON.parse(courseText);
const u2 = course.units.find((u) => u.id === "u2");
const exOf = (id) => u2.sections.flatMap((s) => s.blocks).find((b) => b.id === id);
const sample = readFileSync(new URL("./_speech-sample.webm", import.meta.url));

const ARGS = ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ARGS }).catch(() => chromium.launch({ args: ARGS }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ["microphone"] });
await ctx.route("**/js/fb.js*", (r) => r.fulfill({ contentType: "text/javascript", body: mock }));
await ctx.route("**/_speech-sample.webm", (r) => r.fulfill({ contentType: "audio/webm", body: sample }));
let ltCalls = 0;
await ctx.route("https://api.languagetool.org/**", async (r) => {
  ltCalls++;
  const text = new URLSearchParams(r.request().postData()).get("text") || "";
  const i = text.search(/journalists were/);
  const matches = i < 0 ? [] : [{ offset: i, length: 16, message: "Test: grammar issue.", shortMessage: "Grammar", replacements: [{ value: "journalists are" }], rule: { issueType: "grammar", category: { name: "Grammar" } } }];
  await r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ matches }) });
});
// the "microphone" plays a recording of real speech, so that Whisper has something to recognise
await ctx.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ac = new AudioContext();
    const a = new Audio("/_speech-sample.webm");
    a.crossOrigin = "anonymous";
    const src = ac.createMediaElementSource(a);
    const dst = ac.createMediaStreamDestination();
    src.connect(dst);
    await ac.resume();
    await a.play();
    return dst.stream;
  };
});
const errors = [];
const page = async (url) => {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(url + ": " + e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + url);
  return p;
};
const shot = (p, n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
const step = (x) => console.log("•", x);
const sel = (e, it) => `[data-ex="${e}"][data-item="${it}"]`;
const dbOf = (p) => p.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));

// ---- teacher, course, group, student
const t = await page("/teacher.html");
await t.evaluate(() => {
  localStorage.setItem("mock:auth", JSON.stringify({ "teacher@uni.ru": { uid: "T1", password: "secret1" } }));
  localStorage.setItem("mock:db", JSON.stringify({ "teachers/T1": { name: "Teacher" } }));
});
await t.reload();
await t.fill("#auth-form [name=email]", "teacher@uni.ru");
await t.fill("#auth-form [name=password]", "secret1");
await t.click("#auth-submit");
await t.waitForSelector("#tool-nav .sb-item");
await t.click('a[href="#tools/content"]');
await t.waitForSelector("#import-text");
await t.evaluate((c) => { document.querySelector("#import-text").value = c; }, courseText);
await t.click("[data-act=import]");
await t.waitForSelector('td:has-text("The Effective Communicator")');
const db0 = await dbOf(t);
const pub = JSON.stringify(db0["unitContent/u2"]);
for (const bad of ["Model answer", '"answer":', "Marking (20"]) { const i = pub.indexOf(bad); assert.ok(i < 0, "public unit contains " + bad + ": " + pub.slice(Math.max(0, i - 200), i + 60)); }
assert.ok(pub.includes('"speak":60') || pub.includes('"speak": 60'), "speak items are public");
await t.click('a[href="#tools/groups"]');
await t.waitForSelector("#g-name");
await t.fill("#g-name", "HR-1"); await t.fill("#g-code", "hr-1");
await t.click("[data-act=create-group]");
await t.waitForSelector("code:text('HR-1')");
await t.click('a[href="#tools/access"]');
await t.click("[data-act=toggle-open][data-unit=u2]");

const s = await page("/index.html");
await s.click("[data-mode=register]");
await s.fill("[name=name]", "Anna Ivanova"); await s.fill("[name=email]", "anna@uni.ru");
await s.fill("[name=password]", "pass123"); await s.fill("[name=group]", "hr-1");
await s.click("#auth-submit");
await s.waitForSelector('.sb-uh[data-unit="u2"][data-can-open="1"]', { timeout: 5000 });

step("Writing section: 8 sections, no keys, no arrows; the order of the sections");
await s.evaluate(() => { location.hash = "#u2/writing"; });
await s.waitForSelector("#ex-p11");
const wtext = await s.evaluate(() => document.body.innerText);
assert.ok(!/Key:|Model answer|Marking \(20/.test(wtext), "no keys in the student's Writing section");
assert.ok(!/[←→⇒«»›▶]/.test(wtext), "no arrows");
assert.equal((await s.textContent("#ex-p11 .ex-n")).trim(), "2.7.11");
assert.equal((await s.textContent("#ex-x1 .ex-n").catch(() => "")).trim(), "", "Supplementary Reading is on its own page");
await shot(s, "w1-writing-top");
await s.locator("#ex-p3").scrollIntoViewIfNeeded(); await shot(s, "w2-writing-model");
await s.locator("#ex-p7").scrollIntoViewIfNeeded(); await shot(s, "w3-writing-kwt");

step("Recorded long turn: record, Whisper turns it into text, the field cannot be edited");
await s.evaluate(() => { location.hash = "#u2/speaking"; });
await s.waitForSelector("#ex-s4");
await s.locator("#ex-s4").scrollIntoViewIfNeeded();
assert.equal(await s.locator(`#ex-s4 textarea${sel("s4", "1")}`).getAttribute("readonly"), "", "the transcript is read-only");
await s.click('#ex-s4 .spk[data-tr="s4|1"] [data-spk-act="rec"]');
await s.waitForTimeout(13000);
await s.click('#ex-s4 .spk[data-tr="s4|1"] [data-spk-act="rec"]');
await s.waitForSelector('[data-trs="s4|1"].busy', { timeout: 10000 });
await shot(s, "s1-transcribing");
await s.waitForFunction((q) => document.querySelector(q)?.value?.length > 40, `textarea${sel("s4", "1")}`, { timeout: 180000 });
const tr1 = await s.inputValue(`textarea${sel("s4", "1")}`);
console.log("   transcript:", tr1.slice(0, 140) + "…");
assert.ok(/working words|press secretary|laura/i.test(tr1), "Whisper recognised the speech");
const meta = await s.inputValue(sel("s4", "1~m"));
assert.ok(/dur=1[1-4];words=\d+;take=1/.test(meta), "length of the recording is kept: " + meta);
await s.waitForSelector('[data-trs="s4|1"]:has-text("is now text")');
await s.locator("#ex-s4").screenshot({ path: `${SHOTS}/s2-student-transcript.png` });
let db = await dbOf(s);
assert.ok(!Object.keys(db).some((k) => k.startsWith("submissions/")), "nothing is sent before Done");
step("Done sends the text; the teacher checks the speaking");
await s.click('[data-done="s4"]');
await s.locator("#save-state", { hasText: /Sent to your teacher/ }).waitFor({ timeout: 5000 });
db = await dbOf(s);
const subKey = Object.keys(db).find((k) => k.startsWith("submissions/u2"));
assert.equal(db[subKey].answers.s4["1"], tr1, "the transcript is in the database");
assert.ok(db[subKey].answers.s4["1~m"].startsWith("dur="));
await t.evaluate(() => { location.hash = "#u2/speaking"; });
await t.waitForSelector('[data-act="check-writing"][data-ex="s4"]');
assert.equal((await t.textContent('[data-act="check-writing"][data-ex="s4"]')).trim(), "Check the speaking now");
await t.click('[data-act="check-writing"][data-ex="s4"]');
await s.waitForSelector("#ex-s4 .wfb", { timeout: 15000 });
assert.equal(ltCalls, 1, "one LanguageTool request for the student");
await s.locator("#ex-s4").screenshot({ path: `${SHOTS}/s3-student-feedback.png` });

step("Writing: the proposal is sent with Done");
await s.evaluate(() => { location.hash = "#u2/writing"; });
await s.waitForSelector(sel("p11", "1"));
const prop = "Helping managers communicate with their teams\nIntroduction\nThis proposal suggests two ways of helping managers communicate more effectively with their teams. " +
  "Current situation\nAt present, most briefings consist of a manager reading out instructions, which means that staff rarely ask questions. " +
  "Suggestions\nFirstly, I would recommend organising a course on active listening for all heads of division, because most of them have never been trained. " +
  "Secondly, it would be advisable to hold a short question session after every monthly meeting, so that staff can raise concerns early. " +
  "Benefits\nIf these measures were introduced, problems would come to light earlier. I am confident that this would lead to a reduction in staff turnover.";
await s.fill(sel("p11", "1"), prop);
await s.click('[data-done="p11"]');
await s.locator("#save-state", { hasText: /Sent to your teacher/ }).waitFor({ timeout: 5000 });

step("Progress page: speaking and writing, detail, CSV");
await t.click('a[href="#tools/progress"]');
await t.waitForSelector("table.prog");
const row = await t.textContent("table.prog tbody tr:has-text('Anna Ivanova')");
assert.ok(/\d/.test(row), "the student's numbers are shown: " + row);
await shot(t, "p1-progress-speaking", true);
await t.selectOption("#prog-metric", "wpm");
await t.waitForSelector("table.prog");
const wpm = await t.textContent("table.prog tbody tr:has-text('Anna Ivanova') td.num a");
assert.ok(Number(wpm) > 60 && Number(wpm) < 260, "words a minute: " + wpm);
await t.click("table.prog tbody tr:has-text('Anna Ivanova') td.num a");
await t.waitForSelector("#prog-detail");
assert.ok((await t.textContent("#prog-detail")).includes("1 issues, 1 grammar") || (await t.textContent("#prog-detail")).includes("issues"), "LanguageTool result in the detail");
await shot(t, "p2-progress-detail", true);
await t.click('[data-act="prog-skill"][data-skill="writing"]');
await t.waitForSelector("table.prog");
const wrow = await t.textContent("table.prog tbody tr:has-text('Anna Ivanova')");
assert.ok(/\d/.test(wrow), "writing numbers: " + wrow);
await shot(t, "p3-progress-writing", true);
const [dl] = await Promise.all([t.waitForEvent("download"), t.click('[data-act="prog-csv"]')]);
const csv = readFileSync(await dl.path(), "utf8");
assert.ok(csv.startsWith("﻿code,student,group,skill"), "CSV header");
assert.ok(csv.includes("speaking") && csv.includes("writing") && csv.includes("Anna Ivanova") && /press secretary/i.test(csv), "CSV rows with texts");
console.log("   CSV:", dl.suggestedFilename(), csv.split("\r\n").length - 1, "rows");

step("Mobile width: the recorder and the transcript fit");
const m = s;
await m.setViewportSize({ width: 390, height: 844 });
await m.evaluate(() => { location.hash = "#u2/speaking"; });
await m.waitForSelector("#ex-s4");
await m.locator("#ex-s4").scrollIntoViewIfNeeded();
const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
assert.ok(over <= 1, "no horizontal scroll: " + over);
await shot(m, "m1-mobile-s4");

await browser.close();
if (errors.length) { console.log("Page errors:\n" + errors.join("\n")); process.exit(1); }
console.log("\nALL SPEAKING / WRITING / PROGRESS STEPS PASSED");
