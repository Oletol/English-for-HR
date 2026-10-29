// Unit 2 «The Effective Communicator» with the real course.json: import, student answers, teacher checks, screenshots.
// Run: python3 -m http.server 5055 -d docs &  node tests/u1.e2e.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:5055";
const SHOTS = process.env.SHOTS || "/tmp/shots-u2";
mkdirSync(SHOTS, { recursive: true });
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const courseText = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const course = JSON.parse(courseText);
const u1 = course.units.find((u) => u.id === "u2");
const ex = (id) => u1.sections.flatMap((s) => s.blocks).find((b) => b.id === id);
const ans = (id, it) => { const a = ex(id).items.find((x) => x.id === it).answer; return Array.isArray(a) ? a[0] : a; };

const ARGS = ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ARGS }).catch(() => chromium.launch({ args: ARGS }));
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true, permissions: ["microphone"] });
await ctx.route("**/js/fb.js*", (r) => r.fulfill({ contentType: "text/javascript", body: mock }));
await ctx.route("https://rutube.ru/**", (r) => r.fulfill({ contentType: "text/html", body: "<body style='background:#222;color:#fff;font:20px sans-serif;display:grid;place-items:center'>Rutube player</body>" }));
const errors = [];
const page = async (url, c = ctx) => {
  const p = await c.newPage();
  p.on("pageerror", (e) => errors.push(url + ": " + e.message));
  p.on("dialog", (d) => d.accept());
  await p.goto(BASE + url);
  return p;
};
const shot = (p, n, full = false) => p.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: full });
const step = (t) => console.log("•", t);
const sel = (e, it) => `[data-ex="${e}"][data-item="${it}"]`;

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

step("Import of content-private/course.json");
await t.click('a[href="#tools/content"]');
await t.waitForSelector("#import-text");
await t.evaluate((c) => { document.querySelector("#import-text").value = c; }, courseText);
await t.click("[data-act=import]");
await t.waitForSelector('td:has-text("Models and Processes of Communication")');
const db = await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const pub = JSON.stringify(db["unitContent/u1"]);
for (const bad of ['"answer"', "Script for Audio", "Daniel Ferreira", "Key:", "Model answer"]) assert.ok(!pub.includes(bad), "public content contains " + bad);
assert.equal(db["answerKeys/u1"].exercises.g3["1a"], "was speaking");
await shot(t, "00-teacher-import");

step("Group, student, unit opened");
await t.click('a[href="#tools/groups"]');
await t.waitForSelector("#g-name");
await t.fill("#g-name", "HR-1");
await t.fill("#g-code", "hr-1");
await t.click("[data-act=create-group]");
await t.waitForSelector("code:text('HR-1')");
const s = await page("/index.html");
await s.click("[data-mode=register]");
await s.fill("[name=name]", "Anna Ivanova");
await s.fill("[name=email]", "anna@uni.ru");
await s.fill("[name=password]", "pass123");
await s.fill("[name=group]", "hr-1");
await s.click("#auth-submit");
await s.waitForSelector("text=No units are open yet");
assert.equal(await s.locator(".sb-uh").count(), 5);
await t.click('a[href="#tools/access"]');
await t.click("[data-act=toggle-open][data-unit=u2]");
await s.waitForSelector('.sb-uh[data-unit="u2"][data-can-open="1"]', { timeout: 5000 });
await s.click('.sb-uh[data-unit="u2"]');

await s.click('.sb-item:has-text("Warm-up")');
await s.waitForSelector("#ex-w2");
const text = await s.evaluate(() => document.body.innerText);
assert.ok(!/Key:|Teaching notes|Model answer/.test(text), "key visible");
assert.ok(!/[\u2190\u2192\u21d2\u00ab\u00bb\u203a\u25b6]/.test(text), "arrow");
await shot(s, "s0-top", true);
step("Student answers");
for (const it of ex("w2").items) await s.fill(sel("w2", it.id), ans("w2", it.id));
await s.fill(sel("w2", "1"), "charisma");
for (const it of ex("w4").items) await s.selectOption(sel("w4", it.id), ans("w4", it.id));
await s.fill(sel("w3", "10"), "ill advised");
await s.fill(sel("w3", "4"), "overwhelmed");
await s.selectOption(sel("w5", "1"), "logos");
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });
step("Teacher checks");
await t.click('.sb-uh[data-unit="u2"]').catch(() => {});
// answers reach the teacher only when the student clicks Done
const sendDone = async (href, id) => {
  await s.click(`.sb-item[href$="u2/${href}"]`);
  await s.waitForSelector(`#ex-${id}`);
  if (await s.locator(`[data-done="${id}"]`).count()) {
    await s.click(`[data-done="${id}"]`);
    await s.locator("#save-state", { hasText: /Sent to your teacher/ }).waitFor({ timeout: 5000 });
  }
};
const check = async (id, expect) => {
  await sendDone("warmup", id);
  await t.click('.sb-item[href$="u2/warmup"]');
  await t.waitForSelector(`[data-act="check-ex"][data-ex="${id}"]`);
  await t.click(`[data-act="check-ex"][data-ex="${id}"]`);
  await s.waitForSelector(`#ex-${id} .ex-score`, { timeout: 5000 });
  assert.equal((await s.textContent(`#ex-${id} .ex-score`)).trim(), expect, id);
};
await check("w2", "7 / 8");
await check("w4", "7 / 7");
await check("w3", "1 / 10");
await check("w5", "1 / 8");
for (const id of ["w2", "w3", "w4", "w5", "w6"]) await s.locator(`#ex-${id}`).screenshot({ path: `${SHOTS}/c-${id}.png` });
await t.waitForSelector("#view .tnote");
await shot(t, "t-warmup", true);

step("Reading, Vocabulary, Grammar");
for (const [secName, href] of [["Reading", "reading"], ["Vocabulary Practice", "vocabulary"], ["Grammar in Use", "grammar"], ["Listening", "listening"], ["Speaking", "speaking"], ["Writing", "writing"], ["Supplementary Reading", "supplementary"]]) {
  await s.click(`.sb-item[href$="u2/${href}"]`);
  await s.waitForSelector("#content .ex");
  const tx = await s.evaluate(() => document.body.innerText);
  assert.ok(!/Key:|Teaching notes|Model answer/.test(tx), "key visible in " + secName);
  assert.ok(!/[\u2190\u2192\u21d2\u00ab\u00bb\u203a\u25b6]/.test(tx), "arrow in " + secName);
  await shot(s, "p-" + href, true);
}
await s.click('.sb-item[href$="u2/reading"]');
for (const it of ex("r1").items) await s.selectOption(sel("r1", it.id), ans("r1", it.id));
await s.fill(sel("r4", "2"), "handful");
await s.fill(sel("r4", "1"), "stopped");
await s.click('.sb-item[href$="u2/vocabulary"]');
for (const it of ex("v3").items) await s.selectOption(sel("v3", it.id), ans("v3", it.id));
await s.fill(sel("v2", "3"), "talks down to");
await s.click('.sb-item[href$="u2/grammar"]');
await s.fill(sel("g1", "4"), "was still looking");
await s.fill(sel("g1", "9"), "was always interrupting");
await s.fill(sel("g1", "10"), "didn't help");
for (const it of ex("g2").items) await s.selectOption(sel("g2", it.id), ans("g2", it.id));
await s.selectOption(sel("g4", "1"), "would");
await s.fill(sel("g3", "4"), "didn't understand");
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });
const check2 = async (href, id, expect) => {
  await sendDone(href, id);
  await t.click(`.sb-item[href$="u2/${href}"]`);
  await t.waitForSelector(`[data-act="check-ex"][data-ex="${id}"]`);
  await t.click(`[data-act="check-ex"][data-ex="${id}"]`);
  await s.click(`.sb-item[href$="u2/${href}"]`);
  await s.waitForSelector(`#ex-${id} .ex-score`, { timeout: 5000 });
  assert.equal((await s.textContent(`#ex-${id} .ex-score`)).trim(), expect, id);
  await s.locator(`#ex-${id}`).screenshot({ path: `${SHOTS}/c-${id}.png` });
};
await check2("reading", "r1", "5 / 5");
await check2("reading", "r4", "1 / 8");
await check2("vocabulary", "v3", "9 / 9");
await check2("vocabulary", "v2", "1 / 10");
await check2("grammar", "g1", "3 / 14");
await check2("grammar", "g2", "10 / 10");
await check2("grammar", "g3", "1 / 6");
await check2("grammar", "g4", "0 / 10");
assert.equal(await s.locator("#ex-g5, #ex-g6").count(), 0, "Active Voice part removed");
await s.click('.sb-item[href$="u2/listening"]');
for (const it of ex("l3").items) await s.selectOption(sel("l3", it.id), ans("l3", it.id));
await s.fill(sel("l1", "8"), "a hundred and twenty");
await s.fill(sel("l1", "5"), "five");
await s.click('.sb-item[href$="u2/speaking"]');
for (const it of ex("s2").items) await s.selectOption(sel("s2", it.id), ans("s2", it.id));
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });
await check2("listening", "l3", "8 / 8");
await check2("listening", "l1", "1 / 9");
await check2("speaking", "s2", "7 / 7");
await s.click('.sb-item[href$="u2/supplementary"]');
for (const it of ex("x6").items) await s.selectOption(sel("x6", it.id), ans("x6", it.id));
await s.fill(sel("x4", "3"), "hardly");
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });
await check2("supplementary", "x6", "6 / 6");
await check2("supplementary", "x4", "1 / 7");
for (const href of ["reading", "grammar"]) { await t.click(`.sb-item[href$="u2/${href}"]`); await t.waitForSelector("#view .tnote"); await shot(t, "t-" + href, true); }

step("Speaking timers and voice recorder");
await s.click('.sb-item[href$="u2/speaking"]');
const tA = '.spk[data-spk="blk-u2-sp-a-short"]';
await s.waitForSelector(tA);
assert.equal((await s.textContent(`${tA} .spk-time`)).trim(), "00:30");
await s.click(`${tA} [data-spk-act="start"]`);
await s.waitForTimeout(2300);
const left = (await s.textContent(`${tA} .spk-time`)).trim();
assert.ok(left === "00:28" || left === "00:27", "timer runs: " + left);
await s.click(`${tA} [data-spk-act="start"]`);   // pause
const tR = '.spk[data-spk="blk-u2-sp-t1-disc"]';
await s.click(`${tR} [data-spk-act="rec"]`);
await s.waitForSelector(`${tR} .btn.rec.on`, { timeout: 5000 });
await s.waitForTimeout(3500);
assert.equal(await s.locator(`${tR} .spk-live`).isVisible(), true, "REC line visible");
const recTime = (await s.textContent(`${tR} .spk-rt`)).trim();
const meterW = await s.evaluate((q) => document.querySelector(q + " .spk-meter i").style.width, tR);
console.log("   while recording:", recTime, "meter", meterW, "quiet hint hidden:", await s.locator(`${tR} .spk-quiet`).isHidden());
await s.locator(tR).screenshot({ path: `${SHOTS}/spk-recording.png` });
await s.click(`${tR} [data-spk-act="rec"]`);
await s.waitForSelector(`${tR} .spk-take a[download]`, { timeout: 5000 });
await s.locator(tR).screenshot({ path: `${SHOTS}/spk-recorded.png` });
const [rdl] = await Promise.all([s.waitForEvent("download"), s.click(`${tR} .spk-take a[download]`)]);
console.log("   recording downloaded:", rdl.suggestedFilename());

step("Word export: Student's Book and Teacher's Book");
const { execSync } = await import("node:child_process");
await t.click('.sb-item[href$="u2/reading"]');
await t.waitForSelector('[data-act="docx"][data-ver="student"]');
for (const ver of ["student", "teacher"]) {
  const [dl] = await Promise.all([t.waitForEvent("download", { timeout: 30000 }), t.click(`[data-act="docx"][data-ver="${ver}"]`)]);
  const file = `${SHOTS}/${ver}.docx`;
  await dl.saveAs(file);
  const xml = execSync(`unzip -p ${file} word/document.xml`).toString();
  const txt = xml.replace(/<[^>]+>/g, "");
  console.log("  ", ver, dl.suggestedFilename(), Math.round(xml.length / 1024) + " KB xml");
  assert.ok(txt.includes("Two presentations, one reform"), "text present");
  assert.ok(txt.includes("Background and events in a story"), "grammar present");
  const hasKey = txt.includes("was explaining") && txt.includes("Teaching notes") && txt.includes("Model answers");
  assert.equal(hasKey, ver === "teacher", "keys only in the teacher's book");
}

step("Translation guard on the student page");
await s.evaluate(() => { document.getElementById("tr-probe").textContent = "Пожалуйста, изучайте этот учебник на английском."; });
await s.waitForSelector(".no-translate", { timeout: 4000 });
await shot(s, "x-translate-blocked");
assert.equal(await t.locator(".no-translate").count(), 0, "teacher page is not blocked");
assert.deepEqual(errors, [], "page errors");
console.log("\nALL STEPS PASSED");
await browser.close();
