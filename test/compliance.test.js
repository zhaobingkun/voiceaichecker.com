import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredDisclosurePages = [
  "public/index.html",
  "public/privacy/index.html",
  "public/terms/index.html",
  "public/pricing/index.html"
];

const seoFaqPages = [
  "public/index.html",
  "public/free-ai-voice-detector/index.html",
  "public/ai-audio-detector/index.html",
  "public/deepfake-audio-detector/index.html",
  "public/voice-clone-detector/index.html",
  "public/ai-voice-checker/index.html",
  "public/voice-ai-checker/index.html",
  "public/is-this-voice-ai/index.html"
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

test("core SEO pages expose valid FAQPage structured data", async () => {
  for (const page of seoFaqPages) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    assert.ok(blocks.length > 0, `${page} must include JSON-LD`);

    const faqNode = blocks
      .map((match) => JSON.parse(match[1]))
      .flatMap((data) => (Array.isArray(data["@graph"]) ? data["@graph"] : [data]))
      .find((node) => node["@type"] === "FAQPage");

    assert.ok(faqNode, `${page} must include FAQPage structured data`);
    assert.ok(Array.isArray(faqNode.mainEntity), `${page} FAQPage must include mainEntity`);
    assert.ok(faqNode.mainEntity.length >= 3, `${page} FAQPage should include at least 3 questions`);
  }
});

test("core SEO pages expose visible breadcrumbs and BreadcrumbList structured data", async () => {
  for (const page of seoFaqPages) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    assert.match(html, /<nav class="breadcrumb" aria-label="Breadcrumb">/, `${page} must show a breadcrumb trail`);

    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    const breadcrumbNode = blocks
      .map((match) => JSON.parse(match[1]))
      .flatMap((data) => (Array.isArray(data["@graph"]) ? data["@graph"] : [data]))
      .find((node) => node["@type"] === "BreadcrumbList");

    assert.ok(breadcrumbNode, `${page} must include BreadcrumbList structured data`);
    assert.ok(Array.isArray(breadcrumbNode.itemListElement), `${page} BreadcrumbList must include itemListElement`);
    assert.ok(breadcrumbNode.itemListElement.length >= 1, `${page} BreadcrumbList should include at least Home`);
    assert.equal(breadcrumbNode.itemListElement[0].item, "https://voiceaichecker.com/");
  }
});
