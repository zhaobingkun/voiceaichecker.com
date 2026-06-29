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

const publicHtmlPages = [
  ["public/index.html", "https://voiceaichecker.com/"],
  ["public/free-ai-voice-detector/index.html", "https://voiceaichecker.com/free-ai-voice-detector/"],
  ["public/ai-audio-detector/index.html", "https://voiceaichecker.com/ai-audio-detector/"],
  ["public/deepfake-audio-detector/index.html", "https://voiceaichecker.com/deepfake-audio-detector/"],
  ["public/voice-clone-detector/index.html", "https://voiceaichecker.com/voice-clone-detector/"],
  ["public/ai-voice-checker/index.html", "https://voiceaichecker.com/ai-voice-checker/"],
  ["public/voice-ai-checker/index.html", "https://voiceaichecker.com/voice-ai-checker/"],
  ["public/is-this-voice-ai/index.html", "https://voiceaichecker.com/is-this-voice-ai/"],
  ["public/pricing/index.html", "https://voiceaichecker.com/pricing/"],
  ["public/privacy/index.html", "https://voiceaichecker.com/privacy/"],
  ["public/terms/index.html", "https://voiceaichecker.com/terms/"],
  ["public/refund-policy/index.html", "https://voiceaichecker.com/refund-policy/"]
];

function getTagAttr(html, tagPattern, attrName) {
  const tag = html.match(tagPattern)?.[0] ?? "";
  const attr = tag.match(new RegExp(`${attrName}="([^"]+)"`));
  return attr?.[1] ?? "";
}

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

test("public HTML pages include complete SEO head basics", async () => {
  for (const [page, expectedUrl] of publicHtmlPages) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), "utf8");
    const canonical = getTagAttr(html, /<link[^>]+rel="canonical"[^>]*>/, "href");
    const ogUrl = getTagAttr(html, /<meta[^>]+property="og:url"[^>]*>/, "content");

    assert.match(html, /<title>[^<]+<\/title>/, `${page} must include title`);
    assert.ok(getTagAttr(html, /<meta[^>]+name="description"[^>]*>/, "content"), `${page} must include meta description`);
    assert.equal(canonical, expectedUrl, `${page} canonical must match the expected public URL`);
    assert.equal(ogUrl, canonical, `${page} og:url must match canonical`);
    assert.ok(getTagAttr(html, /<meta[^>]+property="og:title"[^>]*>/, "content"), `${page} must include og:title`);
    assert.ok(getTagAttr(html, /<meta[^>]+property="og:description"[^>]*>/, "content"), `${page} must include og:description`);
    assert.ok(getTagAttr(html, /<meta[^>]+name="twitter:card"[^>]*>/, "content"), `${page} must include twitter:card`);
    assert.ok(getTagAttr(html, /<meta[^>]+name="twitter:title"[^>]*>/, "content"), `${page} must include twitter:title`);
    assert.ok(getTagAttr(html, /<meta[^>]+name="twitter:description"[^>]*>/, "content"), `${page} must include twitter:description`);
    assert.ok(getTagAttr(html, /<link[^>]+rel="icon"[^>]*>/, "href"), `${page} must include favicon`);
    assert.ok(getTagAttr(html, /<meta[^>]+name="viewport"[^>]*>/, "content"), `${page} must include viewport`);
  }
});

test("robots and sitemap expose every public HTML page", async () => {
  const robots = await readFile(new URL("../public/robots.txt", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../public/sitemap.xml", import.meta.url), "utf8");

  assert.match(robots, /^User-agent: \*/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/voiceaichecker\.com\/sitemap\.xml$/m);
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);

  for (const [, url] of publicHtmlPages) {
    assert.match(sitemap, new RegExp(`<loc>${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}</loc>`));
  }
});
