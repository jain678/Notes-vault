// Browser smoke test: sign up → paste text/markdown/code/mermaid/image/file → reload → content persists,
// and a second user cannot open the first user's note.
// Usage: start the app (npm run dev), then: node tests/e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
// require() so a globally installed Playwright also works (otherwise: npm i -D playwright).
const { chromium } = createRequire(import.meta.url)("playwright");
import assert from "node:assert/strict";

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = process.argv[3];
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAP0lEQVR4nO3PQQ0AIAzAQMC/5+ECjiUlJ6APmhszs3nnjXZ3/8hA1kBrIGugNZA10BrIGmgNZA20BrIGWgNZD+sQAvPvq3T5AAAAAElFTkSuQmCC";

async function signUp(page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto(`${BASE}/notes`);
  await page.waitForURL("**/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("password-1234");
  await page.locator("form").getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/notes");
  return email;
}

/** Dispatches a real paste event with the given clipboard items. */
async function paste(page, selector, items) {
  await page.evaluate(
    async ({ selector, items }) => {
      const dt = new DataTransfer();
      for (const it of items) {
        if (it.file) {
          const bytes = Uint8Array.from(atob(it.file.base64), (c) => c.charCodeAt(0));
          dt.items.add(new File([bytes], it.file.name, { type: it.file.type }));
        } else dt.setData(it.type, it.data);
      }
      const target = selector ? document.querySelector(selector) : document;
      target.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { selector, items },
  );
}

// Honour an HTTPS proxy if the environment requires one (local app bypasses it).
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(
  proxyUrl ? { proxy: { server: proxyUrl, bypass: "localhost,127.0.0.1" } } : {},
);
let page;
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await signUp(page);
  await page.getByText("Dump anything here").waitFor();

  // 1. Paste Markdown on the empty screen → new note is created with structured content.
  await paste(page, null, [
    { type: "text/plain", data: "# Meeting notes\n\nSome **bold** idea and a [link](https://example.com).\n\n- first\n- second\n\n- [ ] todo item\n" },
  ]);
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
  const noteUrl = page.url();
  const editor = page.locator(".tiptap");
  await editor.locator("h1", { hasText: "Meeting notes" }).waitFor();
  assert.equal(await editor.locator("strong", { hasText: "bold" }).count(), 1);
  assert.equal(await editor.locator("ul li", { hasText: "second" }).count(), 1);
  assert.equal(await editor.locator('ul[data-type="taskList"]').count(), 1);

  // 2. Paste raw code → code block with detected language.
  await editor.click();
  await page.keyboard.press("Control+End");
  await paste(page, ".tiptap", [
    { type: "text/plain", data: "function greet(name) {\n  const msg = `Hello ${name}`;\n  return msg;\n}" },
  ]);
  await editor.locator("pre code", { hasText: "function greet" }).waitFor();
  const lang = await page.locator(".code-block select").first().inputValue();
  assert.match(lang, /javascript|typescript/);

  // 3. Paste a Markdown mermaid fence → rendered diagram.
  await page.keyboard.press("Control+End");
  await paste(page, ".tiptap", [{ type: "text/plain", data: "```mermaid\ngraph TD\n  A[Paste] --> B[Read]\n```" }]);
  await page.locator(".mermaid-diagram svg").waitFor({ timeout: 15000 });
  const box = await page.locator(".mermaid-diagram svg").boundingBox();
  assert.ok(box && box.width > 50 && box.height > 50, `diagram should be visible, got ${JSON.stringify(box)}`);

  // 4. Paste a screenshot and a PDF → uploaded to private storage.
  await page.keyboard.press("Control+End");
  await paste(page, ".tiptap", [{ file: { name: "screenshot.png", type: "image/png", base64: PNG_1x1 } }]);
  await page.keyboard.press("Control+End");
  await paste(page, ".tiptap", [{ file: { name: "report.pdf", type: "application/pdf", base64: btoa("%PDF-1.4 test") } }]);
  await editor.getByText("report.pdf").waitFor({ timeout: 15000 });
  await page.waitForFunction(() => {
    const img = document.querySelector(".tiptap img");
    return img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 15000 });

  // 5. Paste rich HTML (e.g. from a web page) → table preserved.
  await page.keyboard.press("Control+End");
  await paste(page, ".tiptap", [
    { type: "text/html", data: "<h2>From the web</h2><table><tr><th>Name</th><th>Qty</th></tr><tr><td>Apples</td><td>3</td></tr></table>" },
    { type: "text/plain", data: "From the web Name Qty Apples 3" },
  ]);
  await editor.locator("table td", { hasText: "Apples" }).waitFor();

  // 6. Title + tag, then wait for autosave.
  await page.getByLabel("Title").fill("My first dump");
  await page.getByLabel("Add tag").fill("work");
  await page.keyboard.press("Enter");
  await page.getByText("Saved ✓").waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  if (SHOTS) {
    await page.screenshot({ path: `${SHOTS}/note.png` });
  }

  // 7. Reload → everything persisted.
  await page.reload();
  await editor.locator("h1", { hasText: "Meeting notes" }).waitFor();
  assert.equal(await page.getByLabel("Title").inputValue(), "My first dump");
  await editor.locator("pre code", { hasText: "function greet" }).waitFor();
  await page.locator(".mermaid-diagram svg").waitFor({ timeout: 15000 });
  await editor.locator("table td", { hasText: "Apples" }).waitFor();
  await editor.getByText("report.pdf").waitFor();
  await page.waitForFunction(() => document.querySelector(".tiptap img")?.naturalWidth > 0, null, { timeout: 15000 });
  await page.getByText("#work").first().waitFor();
  await page.waitForTimeout(800);
  const box2 = await page.locator(".mermaid-diagram svg").boundingBox();
  assert.ok(box2 && box2.height > 50, "diagram should render after reload");
  if (SHOTS) {
    const block = page.locator(".code-block", { has: page.locator(".mermaid-diagram") });
    await block.scrollIntoViewIfNeeded();
    const clip = await block.boundingBox();
    if (clip) await page.screenshot({ path: `${SHOTS}/diagram.png`, clip });
  }

  // 8. Sidebar search finds it.
  await page.getByPlaceholder("Search notes…").fill("apples");
  await page.locator("nav a", { hasText: "My first dump" }).waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/search.png` });

  // 9. A different user cannot open it.
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await signUp(page2);
  await page2.goto(noteUrl);
  await page2.getByText("Note not found").waitFor();
  assert.equal(await page2.locator("nav a").count(), 0);

  // Clean up: delete the note (and its uploaded files) through the UI.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(/\/notes$/);
  assert.equal(await page.locator("nav a", { hasText: "My first dump" }).count(), 0);

  // 10. Log out → redirected to login; private pages are blocked.
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");
  await page.goto(noteUrl);
  await page.waitForURL("**/login");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log("E2E OK");
} catch (e) {
  if (SHOTS && page) await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  if (page) console.error("Editor text at failure:\n", await page.locator(".tiptap").innerText().catch(() => "?"));
  throw e;
} finally {
  await browser.close();
}
