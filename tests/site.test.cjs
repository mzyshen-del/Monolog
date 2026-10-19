const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const pages = ["index.html", "diary.html", "guestbook.html"];

test("published pages use Monolog and link to existing local files", () => {
  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    assert.match(html, /<title>Monolog \| /, `${page} title`);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const target = match[1].split("?")[0].split("#")[0];
      if (!target || /^(?:https?:|data:|mailto:)/.test(target)) continue;
      assert.ok(fs.existsSync(path.join(root, target)), `${page}: missing ${target}`);
    }
  }
});
