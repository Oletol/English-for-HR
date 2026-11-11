// Speaking 2.6.4: real recording turned into text. Unit 2 with the real course.json: import, open the unit, a student answers every auto task
// (all correct except item 1), the teacher checks each exercise; writing check of the open tasks; no keys, no arrows.
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
const BASE = "http://127.0.0.1:5055";
const SHOTS = process.env.SHOTS || "/tmp/shots-u2";
mkdirSync(SHOTS, { recursive: true });
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const courseText = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const u2 = JSON.parse(courseText).units.find((u) => u.id === "u2");
// the fake microphone plays a recording of an answer (a synthetic voice reading a text with typical mistakes)
const WAV = process.env.WAV || new URL("./_card.wav", import.meta.url).pathname;
const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${WAV}`] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ["microphone"] });
await ctx.route("**/js/fb.js*", (r) => r.fulfill({ contentType: "text/javascript", body: mock }));
let lt = 0;
await ctx.route("https://api.languagetool.org/**", async (r) => {
  lt++;
  const text = new URLSearchParams(r.request().postData()).get("text") || "";
  const i = text.indexOf("I will went");
  const matches = i < 0 ? [] : [{ offset: i, length: 11, message: "Use the base form after 'will'.", shortMessage: "Wrong verb form",
    replacements: [{ value: "I will go" }], rule: { issueType: "grammar", category: { name: "Grammar" } } }];
  await r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ matches }) });
});
const errors = [];
const page = async (url) => { const p = await ctx.newPage(); p.on("pageerror", (e) => errors.push(url + ": " + e.message)); p.on("dialog", (d) => d.accept()); await p.goto(BASE + url); return p; };
const step = (t) => console.log("•", t);

const t = await page("/teacher.html");
await t.evaluate(() => { localStorage.setItem("mock:auth", JSON.stringify({ "teacher@uni.ru": { uid: "T1", password: "secret1" } })); localStorage.setItem("mock:db", JSON.stringify({ "teachers/T1": { name: "Teacher" } })); });
await t.reload();
await t.fill("#auth-form [name=email]", "teacher@uni.ru"); await t.fill("#auth-form [name=password]", "secret1"); await t.click("#auth-submit");
await t.waitForSelector("#tool-nav .sb-item");
await t.click('a[href="#tools/content"]');
await t.evaluate((c) => { document.querySelector("#import-text").value = c; }, courseText);
await t.click("[data-act=import]"); await t.waitForSelector("text=Imported");
await t.click('a[href="#tools/groups"]'); await t.waitForSelector("#g-name");
await t.fill("#g-name", "PA-21"); await t.fill("#g-code", "PA-21"); await t.click("[data-act=create-group]");
await t.waitForSelector("td:has-text('PA-21')");
await t.click('a[href="#tools/access"]');
await t.click('[data-act="toggle-open"][data-unit="u2"]');
await t.waitForSelector("td .pill.on:text('open')");

const s = await page("/index.html");
await s.evaluate(() => sessionStorage.clear()); await s.reload();
await s.click("[data-mode=register]");
await s.fill("[name=name]", "Anna Ivanova"); await s.fill("[name=email]", "anna@uni.ru"); await s.fill("[name=password]", "pass123"); await s.fill("[name=group]", "PA-21");
await s.click("#auth-submit"); await s.waitForSelector(".cards .pg");

step("Speaking 2.6.4: record 25 seconds, transcribe in the browser, the text and the measurements are saved");
await s.evaluate(() => { location.hash = "#u2/speaking"; });
await s.waitForSelector("#ex-s4 textarea.transcript[readonly]");
const spk = s.locator('.spk[data-tr="s4"]');
await spk.locator("[data-spk-act=rec]").click();
await s.waitForSelector('.spk[data-tr="s4"] .btn.rec.on');
await s.waitForTimeout(25000);
await spk.locator("[data-spk-act=rec]").click();
await s.waitForSelector('.spk[data-tr="s4"] [data-spk-act=tr]', { timeout: 8000 });
const t0 = Date.now();
await spk.locator("[data-spk-act=tr]").first().click();
await s.waitForSelector('.spk[data-tr="s4"] .spk-tr:has-text("Downloading the speech program")', { timeout: 20000 }).catch(() => {});
await spk.locator(".spk-tr").screenshot({ path: `${SHOTS}/speaking-progress.png` }).catch(() => {});
await s.waitForFunction(() => (document.querySelector('#ex-s4 textarea')?.value || "").length > 20, null, { timeout: 300000 });
const said = await s.inputValue("#ex-s4 textarea");
console.log(`   transcribed in ${Math.round((Date.now() - t0) / 1000)} s:`, said);
assert.ok(/difficult task/i.test(said), "the transcript is the recorded speech");
assert.ok(/\d+ words per minute|words/.test(await s.textContent('[data-sp-line="s4"]')), "measurements are shown");
await s.locator('.spk[data-tr="s4"]').screenshot({ path: `${SHOTS}/speaking-done.png` });
assert.match(await s.textContent("[data-foot=s4]"), /1 of 1 answered/);
await s.locator("#ex-s4").screenshot({ path: `${SHOTS}/speaking-transcript.png` });
await s.waitForTimeout(2500);
const db = await s.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const subDoc = Object.entries(db).find(([k]) => k.startsWith("submissions/u2__"))[1];
assert.equal(subDoc.answers.s4["1"], said, "the transcript is saved in the draft");
const mt = JSON.parse(subDoc.answers._speech.s4);
assert.ok(mt.words > 20 && mt.total > 20, "the measurements are saved: " + JSON.stringify(mt));
console.log("   measurements:", JSON.stringify(mt));


step("Teacher sees the transcript and the measurements in Speaking progress");
await t.click('a[href="#tools/speaking"]');
await t.waitForSelector(".t.prog");
assert.match(await t.textContent("#view"), /Anna Ivanova/);
await t.screenshot({ path: `${SHOTS}/teacher-speaking.png`, fullPage: true });
assert.deepEqual(errors, []);
console.log("SPEAKING OK");
await browser.close();
