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
assert.deepEqual(exercises.map((e) => e.id), ["v1", "v2", "v3", "v4", "v5", "v6", "v8", "v7"]);
assert.equal(new Set(exercises.flatMap((e) => e.items.map((it) => `${e.id}/${it.id}`))).size,
  exercises.reduce((n, e) => n + e.items.length, 0));
for (const ex of exercises) for (const item of ex.items) {
  assert.ok((String(item.text || "").match(/___/g) || []).length <= 1,
    `${ex.id}/${item.id} has no duplicate answer blank`);
}
for (const ex of exercises.filter((e) => e.kind !== "open" && e.graded !== false)) {
  assert.equal(ex.check, "teacher", `${ex.id} uses the project check flow`);
  for (const item of ex.items) assert.ok(item.answer, `${ex.id}/${item.id} has an answer`);
}
for (const ex of exercises) {
  const at = section.blocks.indexOf(ex);
  const discussion = section.blocks.slice(at + 1).find((block) => block.type !== "teacher-note");
  assert.ok(discussion?.type === "html" && discussion.html.includes('class="discuss"'),
    `${ex.id} is followed by a discussion`);
  assert.equal((discussion.html.match(/<li>/g) || []).length, 3,
    `${ex.id} has exactly three discussion questions`);
}
const grammar = unit.sections.find((s) => s.id === "grammar");
assert.equal(grammar.title, "Grammar in Use");
const grammarExercises = grammar.blocks.filter((b) => b.type === "exercise");
assert.deepEqual(grammarExercises.map((e) => e.id), ["g1", "g2", "g3", "g4", "g5", "g6", "g7"]);
for (const ex of grammarExercises) for (const item of ex.items) {
  assert.ok((String(item.text || "").match(/___/g) || []).length <= 1,
    `${ex.id}/${item.id} has no duplicate answer blank`);
}
for (const ex of grammarExercises) {
  const at = grammar.blocks.indexOf(ex);
  const discussion = grammar.blocks.slice(at + 1).find((block) => block.type !== "teacher-note");
  assert.ok(discussion?.html?.includes('class="discuss"'), `${ex.id} is followed by discussion`);
  assert.equal((discussion.html.match(/<li>/g) || []).length, 3, `${ex.id} has three discussion questions`);
}
assert.equal(grammar.blocks.filter((b) => b.type === "html" && b.html.includes('class="rule rule-fold"')).length, 3);
for (const id of ["v8"]) assert.equal(exercises.find((e) => e.id === id).graded, false);
assert.equal(grammarExercises.find((e) => e.id === "g6").graded, false);

const browserPaths = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].filter(Boolean);
const executablePath = browserPaths.find(existsSync);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route("**/js/fb.js*", (route) => route.fulfill({ contentType: "text/javascript", body: mock }));
let ltCalls = 0, groqCalls = 0;
await ctx.route("https://api.languagetool.org/**", async (route) => {
  ltCalls++;
  await route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ matches: [] }) });
});
await ctx.route("https://api.groq.com/openai/v1/chat/completions", async (route) => {
  groqCalls++;
  assert.equal(route.request().headers().authorization, "Bearer gsk_test_only");
  const review = { cefr: "A2", task_achievement: "effective", summary: "The response gives relevant and practical actions.",
    strengths: ["The answer uses the target vocabulary."],
    priorities: [{ issue: "Add a reason", advice: "Explain why one action helps.", example: "A mentor helps because the employee has one person to ask." }] };
  await route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(review) } }] }) });
});
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
await teacher.click('a[href="#tools/ai"]');
await teacher.fill("#groq-key", "gsk_test_only");
await teacher.click('[data-act="groq-save"]');
await teacher.waitForSelector(".ai-key-status .pill.on");
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
assert.equal(await student.locator("#content .ex").count(), 8);
assert.equal(await student.locator("#content .fc-card").count(), 1);
assert.equal(await student.locator("#content .discuss").count(), 8);
for (const discussion of await student.locator("#content .discuss").all())
  assert.equal(await discussion.locator("li").count(), 3);
assert.ok(!/Key:|Suggested marking|Possible answer/.test(await student.textContent("#content")));
await student.click('.sb-item[href$="u1/grammar"]');
await student.waitForSelector("#ex-g7");
assert.equal(await student.locator("#content .ex").count(), 7);
assert.equal(await student.locator("#content .discuss").count(), 7);
assert.match(await student.textContent("#content"), /All tenses: present, past and future/);
assert.equal(await student.locator("#content details.rule-fold").count(), 3);
assert.equal(await student.locator("#content details.rule-fold[open]").count(), 0);
await student.locator("#content details.rule-fold summary").first().click();
assert.equal(await student.locator("#content details.rule-fold[open]").count(), 1);
assert.equal(await student.locator('#ex-g6 .ex-score').count(), 0);
await student.click('.sb-item[href$="u1/vocabulary"]');

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

await student.fill('[data-ex="v7"][data-item="1"]', "Give the new employee a mentor and ask about their background. Invite them to meetings so they feel accepted in an inclusive team.");
await student.click('[data-done="v7"]');
await student.waitForFunction(() => Object.entries(JSON.parse(localStorage.getItem("mock:db") || "{}"))
  .some(([key, value]) => key.startsWith("submissions/") && value.answers?._done?.v7), null, { timeout: 5000 });
await teacher.click('[data-act="check-writing"][data-ex="v7"]');
await student.waitForSelector("#ex-v7 .wfb");
const feedback = await student.textContent("#ex-v7 .wfb");
assert.ok(ltCalls >= 1, "LanguageTool was called");
assert.equal(groqCalls, 1, "Groq was called once");
assert.match(feedback, /Vocabulary level: [ABC][12]/, "CEFR vocabulary level is shown");
assert.match(feedback, /Optional AI review/);
assert.match(feedback, /estimated A2/);
const finalDb = await teacher.evaluate(() => JSON.parse(localStorage.getItem("mock:db")));
assert.ok(!JSON.stringify(finalDb).includes("gsk_test_only"), "Groq key was not stored in Firebase data");
assert.deepEqual(errors, []);

console.log("UNIT 1 VOCABULARY PRACTICE PASSED");
await browser.close();
