// English for HR, Unit 1 Workplace Diversity, with the real course.json: import, the learner's answers,
// the learner's answers shown in the Teacher's Edition after Done (individual lessons), teacher checks, screenshots.
// Run: python3 -m http.server 5055 -d docs &  node tests/u1.e2e.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:5055";
const SHOTS = process.env.SHOTS || "/tmp/shots-u1";
mkdirSync(SHOTS, { recursive: true });
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const courseText = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const course = JSON.parse(courseText);
const U = course.units.find((u) => u.id === "u1");
const ex = (id) => U.sections.flatMap((s) => s.blocks).find((b) => b.id === id);
const ans = (id, it) => { const a = ex(id).items.find((x) => x.id === it).answer; return Array.isArray(a) ? a[0] : a; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route("**/js/fb.js*", (r) => r.fulfill({ contentType: "text/javascript", body: mock }));
const errors = [];
const page = async (url) => {
  const p = await ctx.newPage();
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
await t.waitForSelector('td:has-text("Workplace Diversity")');
const db = await t.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const pub = JSON.stringify(db["unitContent/u1"]);
for (const bad of ['"answer":', "Key:", "Model answer", "Bertrand, M.", "Suggested marking"]) assert.ok(!pub.includes(bad), "public content contains " + bad);

step("Group, one learner, unit opened");
await t.click('a[href="#tools/groups"]');
await t.waitForSelector("#g-name");
await t.fill("#g-name", "Olga");
await t.fill("#g-code", "olga-1");
await t.click("[data-act=create-group]");
await t.waitForSelector("code:text('olga-1')");
const s = await page("/index.html");
await s.click("[data-mode=register]");
await s.fill("[name=name]", "Olga Petrova");
await s.fill("[name=email]", "olga@uni.ru");
await s.fill("[name=password]", "pass123");
await s.fill("[name=group]", "olga-1");
await s.click("#auth-submit");
await s.waitForSelector("text=No units are open yet");
await t.click('a[href="#tools/access"]');
await t.click("[data-act=toggle-open][data-unit=u1]");
await s.waitForSelector('.sb-uh[data-unit="u1"][data-can-open="1"]', { timeout: 5000 });
await s.click('.sb-uh[data-unit="u1"]');
await s.click('.sb-item[href$="u1/warmup"]');
await s.waitForSelector("#ex-w7");
const text = await s.evaluate(() => document.body.innerText);
assert.ok(!/Key:|Teaching notes|Model answer|Suggested marking/.test(text), "key visible");
assert.ok(!/[←→⇒«»›▶]/.test(text), "arrow");
await shot(s, "s-warmup", true);

step("The teacher's unit page: before the learner sends anything");
await t.click('.sb-uh[data-unit="u1"]').catch(() => {});
await t.click('.sb-item[href$="u1/warmup"]');
await t.waitForSelector(".viewas select");
assert.match(await t.textContent(".viewas"), /has not sent anything/);
assert.equal(await t.locator(sel("w2", "1")).isDisabled(), true, "fields are read-only while showing the learner");

step("Learner answers, clicks Done; answers appear in the Teacher's Edition");
for (const it of ex("w2").items) await s.selectOption(sel("w2", it.id), ans("w2", it.id));
await s.selectOption(sel("w2", "3"), "below the surface");
for (const it of ex("w3").items) await s.selectOption(sel("w3", it.id), ans("w3", it.id));
await s.selectOption(sel("w3", "7"), "raise");
await s.fill(sel("w1", "1"), "My first manager was only twenty-three.");
await s.click('[data-done="w2"]');
await s.locator("#save-state", { hasText: /Sent to your teacher/ }).waitFor({ timeout: 5000 });
await t.waitForSelector('#ex-w2 .sp-pill.on', { timeout: 5000 });
assert.match(await t.textContent("#ex-w2 .sp-pill"), /Done/);
assert.equal((await t.textContent("#ex-w2 .ex-score")).trim(), "9 / 10");
assert.equal(await t.inputValue(sel("w2", "1")), ans("w2", "1"));
assert.equal(await t.locator("#ex-w2 .bad").count(), 1, "one wrong answer marked");
assert.match(await t.textContent("#ex-w3 .sp-pill"), /not Done yet/);
assert.equal(await t.locator("#ex-w3 .bad").count(), 0, "not Done: answers shown without marks");
await s.click('[data-done="w3"]');
await s.click('[data-done="w1"]');
await t.waitForFunction(() => /^Done$/.test(document.querySelector("#ex-w3 .sp-pill")?.textContent || ""), null, { timeout: 5000 });
assert.equal(await t.inputValue(sel("w1", "1")), "My first manager was only twenty-three.");
await t.locator("#ex-w2").screenshot({ path: `${SHOTS}/t-w2-student.png` });
await t.locator(".viewas").screenshot({ path: `${SHOTS}/t-viewas.png` });

step("Switch to the teacher's own answers and back");
await t.selectOption(".viewas select", "me");
await t.waitForFunction(() => !document.querySelector('[data-ex="w2"][data-item="1"]').disabled);
assert.equal(await t.inputValue(sel("w2", "1")), "", "own answers are empty");
await t.selectOption(sel("w2", "1"), "below the surface");
await t.selectOption(".viewas select", { index: 0 });
await t.waitForSelector("#ex-w2 .sp-pill.on");
assert.equal(await t.inputValue(sel("w2", "1")), ans("w2", "1"));

step("Teacher checks; the learner sees the score");
for (const [id, expect] of [["w2", "9 / 10"], ["w3", "9 / 10"]]) {
  await t.click(`[data-act="check-ex"][data-ex="${id}"]`);
  await s.waitForSelector(`#ex-${id} .ex-score`, { timeout: 5000 });
  assert.equal((await s.textContent(`#ex-${id} .ex-score`)).trim(), expect, id);
}
for (const it of ex("w4").items) await s.click(`input[name="w4__${it.id}"][value="${ans("w4", it.id)}"]`);
for (const it of ex("w5").items) await s.selectOption(sel("w5", it.id), ans("w5", it.id));
for (const it of ex("w7").items) await s.selectOption(sel("w7", it.id), ans("w7", it.id));
await s.fill(sel("w6", "1"), "You will report to the Head of HR. You speak fluent English and are confident with Excel and HR systems.");
for (const id of ["w4", "w5", "w6", "w7"]) await s.click(`[data-done="${id}"]`);
await t.waitForFunction(() => /^Done$/.test(document.querySelector("#ex-w5 .sp-pill")?.textContent || ""), null, { timeout: 5000 });
for (const [id, expect] of [["w4", "4 / 4"], ["w5", "7 / 7"], ["w7", "8 / 8"]]) {
  await t.click(`[data-act="check-ex"][data-ex="${id}"]`);
  await s.waitForSelector(`#ex-${id} .ex-score`, { timeout: 5000 });
  assert.equal((await s.textContent(`#ex-${id} .ex-score`)).trim(), expect, id);
}
for (const id of ["w2", "w3", "w4", "w5", "w7"]) await s.locator(`#ex-${id}`).screenshot({ path: `${SHOTS}/c-${id}.png` });
await t.waitForSelector("#view .tnote");
await shot(t, "t-warmup", true);
await shot(s, "s-warmup-checked", true);

assert.deepEqual(errors, [], "page errors");
console.log("\nALL STEPS PASSED");
await browser.close();
