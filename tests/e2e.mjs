// Browser smoke test for the full flow:
// sign up → paste a raw dump → check detected blocks → save → read view → edit → reload →
// original paste → search → isolation from a second user → delete → log out.
// Usage: start the app (npm run dev), then: node tests/e2e.mjs [baseUrl] [screenshotDir]
import { createRequire } from "node:module";
import assert from "node:assert/strict";

// require() so a globally installed Playwright also works (otherwise: npm i -D playwright).
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.argv[2] ?? "http://localhost:3000";
const SHOTS = process.argv[3];
const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAIAAAAt/+nTAAAAP0lEQVR4nO3PQQ0AIAzAQMC/5+ECjiUlJ6APmhszs3nnjXZ3/8hA1kBrIGugNZA10BrIGmgNZA20BrIGWgNZD+sQAvPvq3T5AAAAAElFTkSuQmCC";

const DUMP = `meeting w/ infra team thurs
need to decide on search indexing - options below

def tokenize(text):
    words = text.lower().split()
    return [w for w in words if w]

graph LR
  Paste --> Detect
  Detect --> Vault

error from staging:
TypeError: cannot read property 'id' of undefined
    at render (app.js:42)
    at update (app.js:77)

https://example.com/design-spec

Options
- Postgres full-text search
- Meilisearch
- Elastic

Name\tCost\tLatency
Postgres\t$0\t40ms
Meilisearch\t$20\t8ms

decision next week`;

async function signUp(page) {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await page.goto(`${BASE}/notes`);
  await page.waitForURL("**/login");
  await page.waitForLoadState("networkidle");
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

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxyUrl ? { proxy: { server: proxyUrl, bypass: "localhost,127.0.0.1" } } : {});
let page;
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept(d.type() === "prompt" ? "Engineering" : undefined));

  await signUp(page);
  await page.getByRole("heading", { name: "Dump anything" }).waitFor();

  // 1. Paste on the home screen → New note screen with the dump analysed.
  await paste(page, null, [{ type: "text/plain", data: DUMP }]);
  await page.waitForURL("**/notes/new");
  const badges = page.getByTestId("block-badge");
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="block-badge"]').length >= 9);
  assert.deepEqual(await badges.allInnerTexts(), [
    "Text", "Code · Python", "Diagram · Mermaid", "Log", "Link", "Heading", "List", "Table", "Text",
  ]);
  assert.equal(await page.getByText("error from staging:", { exact: true }).count(), 1, "intro line shown as caption");

  // 2. Paste a screenshot into the paste box → uploaded image block.
  await page.getByLabel("Paste anything").click();
  await page.keyboard.press("Control+End");
  await paste(page, "#nn-raw", [{ file: { name: "screenshot.png", type: "image/png", base64: PNG } }]);
  await page.locator('[data-block-kind="image"] img').waitFor({ timeout: 15000 });

  // 3. Re-type a block: last line becomes a heading.
  await page.getByLabel("Change type of block 9").selectOption("heading");
  assert.equal(await badges.nth(8).innerText(), "Heading");

  // 4. Title, new collection (prompt answered "Engineering"), tags.
  await page.getByLabel("Title", { exact: true }).fill("Infra meeting: search indexing");
  await page.getByLabel("Collection", { exact: true }).selectOption("__new");
  await page.waitForFunction(() => document.querySelector("#nn-coll")?.selectedOptions[0]?.textContent === "Engineering");
  await page.getByLabel("Tags", { exact: true }).fill("search, infra");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/new-note.png` });
  await page.getByRole("button", { name: "Save to vault" }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
  const noteUrl = page.url();

  // 5. Reading view.
  const doc = page.locator(".vault-doc");
  await page.getByRole("heading", { level: 1, name: "Infra meeting: search indexing" }).waitFor();
  await page.getByText("Engineering /").waitFor();
  await page.locator("main").getByText("search", { exact: true }).first().waitFor();
  await doc.locator(".code-block", { hasText: "def tokenize" }).getByText("Python", { exact: true }).waitFor();
  await doc.locator(".mermaid-diagram svg").waitFor({ timeout: 15000 });
  await doc.locator(".code-block", { hasText: "TypeError" }).getByText("Log", { exact: true }).waitFor();
  assert.equal(await doc.locator("a.link-card").getAttribute("href"), "https://example.com/design-spec");
  await doc.locator("h2", { hasText: "Options" }).waitFor();
  await doc.locator("ul li", { hasText: "Meilisearch" }).waitFor();
  await doc.locator("table td", { hasText: "40ms" }).waitFor();
  await page.waitForFunction(() => document.querySelector(".vault-doc img")?.naturalWidth > 0, null, { timeout: 15000 });
  await page.getByRole("navigation", { name: "On this page" }).getByRole("button", { name: "decision next week" }).waitFor();
  await page.getByRole("button", { name: "View source" }).click();
  await doc.locator("pre code", { hasText: "Paste --> Detect" }).waitFor();
  await page.getByRole("navigation", { name: "Collections" }).getByRole("link", { name: "Infra meeting: search indexing" }).waitFor();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/note.png` });

  // 6. Edit, then reload: changes persist.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("toolbar", { name: "Formatting" }).waitFor();
  await doc.locator("h2", { hasText: "decision next week" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Added while editing.");
  await page.getByText("Saved", { exact: true }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "Done" }).click();
  await page.reload();
  await doc.getByText("Added while editing.").waitFor();
  await doc.locator(".mermaid-diagram svg").waitFor({ timeout: 15000 });

  // 7. Original paste is kept.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "View original paste" }).click();
  await page.getByRole("region", { name: "Original paste" }).getByText("meeting w/ infra team thurs").waitFor();

  // 8. Search.
  await page.getByLabel("Search the vault").fill("meilisearch");
  await page.getByRole("navigation", { name: "Search results" }).getByRole("link", { name: /Infra meeting/ }).waitFor();
  await page.getByLabel("Search the vault").fill("");

  // 9. A different user cannot open it.
  const ctx2 = await browser.newContext();
  const page2 = await ctx2.newPage();
  await signUp(page2);
  await page2.goto(noteUrl);
  await page2.getByText("Note not found").waitFor();
  assert.equal(await page2.getByRole("navigation", { name: "Collections" }).getByRole("link").count(), 0);
  await ctx2.close();

  // 10. Delete (removes its files), then log out.
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Delete note" }).click();
  await page.waitForURL(/\/notes$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login");
  await page.goto(noteUrl);
  await page.waitForURL("**/login");

  assert.deepEqual(errors, [], `page errors: ${errors.join("\n")}`);
  console.log("E2E OK");
} catch (e) {
  if (SHOTS && page) await page.screenshot({ path: `${SHOTS}/failure.png` }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
