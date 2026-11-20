// Copies browser-only vendor files into public/vendor (run on install).
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const files = [["node_modules/pagedjs/dist/paged.polyfill.min.js", "public/vendor/paged.polyfill.min.js"]];
mkdirSync(join(root, "public/vendor"), { recursive: true });
for (const [from, to] of files) {
  if (existsSync(join(root, from))) copyFileSync(join(root, from), join(root, to));
  else console.warn(`copy-vendor: missing ${from}`);
}
