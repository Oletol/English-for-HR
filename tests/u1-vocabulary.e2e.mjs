// Focused smoke test for Unit 1 · Vocabulary Practice.
// Run with the course server on port 5055.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = "http://127.0.0.1:5055";
const mock = readFileSync(new URL("./mock-fb.js", import.meta.url), "utf8");
const courseText = readFileSync(new URL("../content-private/course.json", import.meta.url), "utf8");
const course = JSON.parse(courseText);
const unit = course.units.find((u) => u.id === "u1");
const section = unit.sections.find((s) => s.id === "vocabulary");
assert.equal(unit.title, "Workplace Diversity");
assert.equal(section.title, "Vocabulary Practice");
assert.equal(section.subtitle, "People, policies and fair hiring");
const exercises = section.blocks.filter((b) => b.type === "exercise");
assert.deepEqual(exercises.map((e) => e.id), ["v1", "v2", "v3", "v4", "v5", "v6", "v7"]);
assert.equal(new Set(exercises.flatMap((e) => e.items.map((it) => `${e.id}/${it.id}`))).size,
  exercises.reduce((n, e) => n + e.items.length, 0));
for (const ex of exercises.filter((e) => e.kind !== "open")) {
  assert.equal(ex.check, "teacher", `${ex.id} uses the project check flow`);
  for (const item of ex.items) assert.ok(item.answer, `${ex.id}/${item.id} has an answer`);
}

const browserPaths = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].filter(Boolean);
const executablePath = browserPaths.find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route("**/js/fb.js*", (route) => route.fulfill({ contentType: "text/javascript", body: mock }));
const errors = [];
const openPage = async (url) => {
  const page = await ctx.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto(BASE + url);
  return page;
};

const teacher = await openPage("/teacher.html");
await teacher.evaluate(() => {
  localStorage.setItem("mock:auth", JSON.stringify({ "teacher@uni.ru": { uid: "T1", password: "secret1" } }));
  localStorage.setItem("mock:db", JSON.stringify({ "teachers/T1": { name: "Teacher" } }));
});
await teacher.reload();
await teacher.fill("#auth-form [name=email]", "teacher@uni.ru");
await teacher.fill("#auth-form [name=password]", "secret1");
await teacher.click("#auth-submit");
await teacher.click('a[href="#tools/content"]');
await teacher.fill("#import-text", courseText);
await teacher.click("[data-act=import]");
await teacher.waitForSelector('td:has-text("Workplace Diversity")');

const stored = await teacher.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
const publicContent = JSON.stringify(stored["unitContent/u1"]);
assert.ok(publicContent.includes("Vocabulary Practice"));
assert.ok(!publicContent.includes('"answer"'), "answer keys are not public");
assert.ok(!publicContent.includes("Suggested marking"), "teacher notes are not public");

await teacher.click('a[href="#tools/groups"]');
await teacher.fill("#g-name", "HR A2+");
await teacher.fill("#g-code", "hr-a2");
await teacher.click("[data-act=create-group]");

const student = await openPage("/index.html");
await student.click("[data-mode=register]");
await student.fill("[name=name]", "Anna Petrova");
await student.fill("[name=email]", "anna@uni.ru");
await student.fill("[name=password]", "pass123");
await student.fill("[name=group]", "hr-a2");
await student.click("#auth-submit");
await teacher.click('a[href="#tools/access"]');
await teacher.click('[data-act=toggle-open][data-unit="u1"]');
await student.waitForSelector('.sb-uh[data-unit="u1"][data-can-open="1"]');
await student.click('.sb-uh[data-unit="u1"]');
await student.click('.sb-item[href$="u1/vocabulary"]');
await student.waitForSelector("#ex-v7");
assert.match(await student.textContent("#content"), /People, policies and fair hiring/);
assert.equal(await student.locator("#content .ex").count(), 7);
assert.equal(await student.locator("#content .fc-card").count(), 1);
assert.ok(!/Key:|Suggested marking|Possible answer/.test(await student.textContent("#content")));

const answer = (exId, itemId) => {
  const ex = exercises.find((candidate) => candidate.id === exId);
  const value = ex.items.find((item) => item.id === itemId).answer;
  return Array.isArray(value) ? value[0] : value;
};
for (const item of exercises.find((e) => e.id === "v2").items)
  await student.selectOption(`[data-ex="v2"][data-item="${item.id}"]`, answer("v2", item.id));
await student.click('[data-done="v2"]');
await teacher.click('.sb-uh[data-unit="u1"]');
await teacher.click('.sb-item[href$="u1/vocabulary"]');
await teacher.waitForSelector('[data-act="check-ex"][data-ex="v2"]');
await teacher.click('[data-act="check-ex"][data-ex="v2"]');
await student.waitForSelector("#ex-v2 .ex-score");
assert.equal((await student.textContent("#ex-v2 .ex-score")).trim(), "8 / 8");
assert.equal(await student.locator('#ex-v2 [data-undone="v2"]').count(), 0, "checked work stays locked");
assert.deepEqual(errors, []);

console.log("UNIT 1 VOCABULARY PRACTICE PASSED");
await browser.close();
