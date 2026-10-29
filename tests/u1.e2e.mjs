// Unit 1 «Models and Processes of Communication» with the real course.json: import, student answers, teacher checks, screenshots.
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
const u1 = course.units.find((u) => u.id === "u1");
const ex = (id) => u1.sections.flatMap((s) => s.blocks).find((b) => b.id === id);
const ans = (id, it) => { const a = ex(id).items.find((x) => x.id === it).answer; return Array.isArray(a) ? a[0] : a; };

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }).catch(() => chromium.launch());
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
await t.click("[data-act=toggle-open][data-unit=u1]");
await s.waitForSelector('.sb-uh[data-unit="u1"][data-can-open="1"]', { timeout: 5000 });
await s.click('.sb-uh[data-unit="u1"]');

const sections = ["Warm-up", "Reading", "Vocabulary Practice", "Grammar in Use", "Listening", "Video", "Speaking", "Writing", "Exam Practice"];
for (const [i, name] of sections.entries()) {
  await s.click(`.sb-item:has-text("${name}")`);
  await s.waitForSelector("#content .ex, #content .fc");
  await shot(s, `s${i + 1}-${name.split(" ")[0].toLowerCase()}`);
  const text = await s.evaluate(() => document.body.innerText);
  assert.ok(!/Key:|Script for Audio|Daniel Ferreira|Teaching notes/.test(text), "student sees a key or a script in " + name);
  assert.ok(!/[←→⇒⤴«»›▶]/.test(text), "arrow in " + name);
}

step("Student answers");
await s.click('.sb-item:has-text("Warm-up")');
await s.selectOption(sel("w1", "1"), ans("w1", "1"));
await s.selectOption(sel("w1", "2"), ans("w1", "2"));
const wrong3 = ex("w1").items[2].choices.find((c) => c !== ans("w1", "3"));
await s.selectOption(sel("w1", "3"), wrong3);
for (const it of ex("w5").items) await s.selectOption(sel("w5", it.id), ans("w5", it.id));
await s.selectOption(sel("w3", "1"), "candid");
await s.selectOption(sel("w3", "2"), "candid");
await s.fill(sel("w7", "1"), "First, encode the message in plain language and choose a better channel.");
await s.click('.sb-item:has-text("Grammar in Use")');
await s.fill(sel("g3", "1a"), "was speaking");
await s.fill(sel("g3", "1b"), "interrupted");
await s.fill(sel("g3", "3"), "negotiated");
await s.fill(sel("g3", "2a"), "wrote");
await s.fill(sel("g2", "11"), "already discussed");
await s.click('.sb-item:has-text("Writing")');
await s.fill(sel("wr2", "1"), "She checked her email, answered three phone calls and prepared a short report.");
await s.fill(sel("wr2", "2"), "The report was late but nobody complained about it.");
await s.fill(sel("wr2", "3"), "however,the department decided to change its policy");
await s.selectOption(sel("wr1", "1"), "1");
await s.click('.sb-item:has-text("Exam Practice")');
await s.selectOption(sel("e1", "1"), "happen");
await s.selectOption(sel("e1", "2"), "keep");
await s.fill(sel("e3", "3"), "has difficulty in giving");
await s.fill(sel("e3", "6"), "is a lot better at");
await s.locator("#save-state", { hasText: /Saved|saved/ }).waitFor({ timeout: 5000 });

step("Teacher checks exercises one by one");
await t.click('.sb-uh[data-unit="u1"]').catch(() => {});
const check = async (secName, id, expect) => {
  // answers reach the teacher only when the student clicks Done
  await s.click(`.sb-item[href^="#u1/"]:has-text("${secName}")`);
  await s.waitForSelector(`#ex-${id}`);
  if (await s.locator(`[data-done="${id}"]`).count()) {
    await s.click(`[data-done="${id}"]`);
    await s.locator("#save-state", { hasText: /Sent to your teacher/ }).waitFor({ timeout: 5000 });
  }
  await t.click(`.sb-item[href^="#u1/"]:has-text("${secName}")`);
  await t.waitForSelector(`[data-act="check-ex"][data-ex="${id}"]`);
  await t.click(`[data-act="check-ex"][data-ex="${id}"]`);
  await s.click(`.sb-item[href^="#u1/"]:has-text("${secName}")`);
  await s.waitForSelector(`#ex-${id} .ex-score`, { timeout: 5000 });
  assert.equal((await s.textContent(`#ex-${id} .ex-score`)).trim(), expect, id);
};
await check("Warm-up", "w1", `2 / ${ex("w1").items.length}`);
assert.equal(await s.locator(`${sel("w1", "3")}.bad`).count(), 1);
await s.locator("#ex-w1").screenshot({ path: `${SHOTS}/c1-w1-checked.png` });
await check("Warm-up", "w5", "8 / 8");
await check("Warm-up", "w3", "1 / 11");
await s.locator("#ex-w5").screenshot({ path: `${SHOTS}/c0-w5-checked.png` });
await s.locator("#ex-w4").screenshot({ path: `${SHOTS}/c0-w4.png` });
await s.locator("#ex-w7").screenshot({ path: `${SHOTS}/c0-w7.png` });
await check("Grammar in Use", "g3", `3 / ${ex("g3").items.length}`);
await s.locator("#ex-g3").screenshot({ path: `${SHOTS}/c2-g3-checked.png` });
await check("Grammar in Use", "g2", `1 / 15`);
await check("Writing", "wr2", `2 / 8`);
assert.equal(await s.locator(`${sel("wr2", "2")}.bad`).count(), 1, "missing comma is wrong");
assert.equal(await s.locator(`${sel("wr2", "3")}.ok`).count(), 1, "case, spaces and final stop do not matter");
await s.locator("#ex-wr2").screenshot({ path: `${SHOTS}/c3-wr2-checked.png` });
await check("Exam Practice", "e1", `1 / 8`);
await check("Exam Practice", "e3", `2 / 6`);
await s.locator("#ex-e1").screenshot({ path: `${SHOTS}/c4-e1-checked.png` });

step("Teacher's Edition screenshots");
for (const [i, name] of ["Listening", "Video", "Grammar in Use", "Speaking"].entries()) {
  await t.click(`.sb-item[href$="/${{ "Grammar in Use": "grammar" }[name] || name.toLowerCase()}"]`);
  await t.waitForSelector("#view .tnote");
  await shot(t, `t${i + 1}-${name.split(" ")[0].toLowerCase()}`);
}

step("Mobile width");
await s.setViewportSize({ width: 390, height: 844 });
await s.evaluate(() => { location.hash = "#u1/video"; });
await s.waitForTimeout(600);
await shot(s, "m1-video-mobile");
const ow = await s.evaluate(() => document.documentElement.scrollWidth);
assert.ok(ow <= 392, "horizontal scroll on mobile: " + ow);

assert.deepEqual(errors, [], "page errors");
console.log("\nALL STEPS PASSED");
await browser.close();
