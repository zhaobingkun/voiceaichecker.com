import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredDisclosurePages = [
  "public/index.html",
  "public/privacy/index.html",
  "public/terms/index.html",
  "public/pricing/index.html"
];

test("customer-facing pages disclose the live detection provider and model", async () => {
  for (const page of requiredDisclosurePages) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /Modulate/i, `${page} must identify Modulate`);
    assert.match(html, /Velma-2 Synthetic Voice Detection/i, `${page} must identify Velma-2`);
  }
});

test("customer support email is visible on the homepage and billing pages", async () => {
  for (const page of ["public/index.html", "public/pricing/index.html", "public/refund-policy/index.html"]) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /mailto:bingkun\.zhao@gmail\.com/i, `${page} must show the support email`);
  }
});
