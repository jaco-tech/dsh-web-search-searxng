// Hermetic load test: import the BUILT module and plug it into a real cordis
// Context next to the real `ctx.web` service from @deepseek-ai/dsh-web, the
// way DSH's loader does. No network: `fetch` is stubbed.
//
// It exists because 0.2.1 failed at import under DSH 0.2.x
// (`@deepseek-ai/dsh-settings` no longer exports `installSettingsSection`),
// which a type-check against the old devDependencies never showed.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Context } from "@deepseek-ai/cordis";
import { isVolatile, updateVolatile } from "@deepseek-ai/cosmokit";
import { WebRuntime } from "@deepseek-ai/dsh-web";

const BASE_URL = "http://searxng.test";
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub `fetch` with a canned SearXNG body and record every requested URL. */
function stubFetch(body) {
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  return urls;
}

async function boot(config) {
  const plugin = await import("../lib/index.js");
  const ctx = new Context();
  await ctx.plugin(WebRuntime, { searchProvider: "searxng" });
  const fiber = await ctx.plugin(plugin, config);
  return { ctx, fiber, plugin };
}

test("module imports and exports a cordis plugin", async () => {
  const plugin = await import("../lib/index.js");
  assert.equal(plugin.name, "web-search-searxng");
  assert.deepEqual(plugin.inject, ["web"]);
  assert.equal(typeof plugin.apply, "function");
  assert.equal(plugin.SEARXNG_PROVIDER_ID, "searxng");
});

test("config fields parse to volatile references", async () => {
  const { Config } = await import("../lib/index.js");
  const parsed = Config({ baseURL: BASE_URL, language: "en" });
  for (const key of ["baseURL", "language", "categories", "timeRange"]) {
    assert.ok(isVolatile(parsed[key]), `${key} is volatile`);
  }
  assert.equal(parsed.baseURL.get(), BASE_URL);
  assert.equal(parsed.language.get(), "en");
  assert.equal(parsed.categories.get(), "");
});

test("registers the searxng provider in ctx.web and serves a search", async () => {
  const urls = stubFetch({
    query: "q",
    results: [
      { url: "https://a.example", title: "A", content: "alpha" },
      { url: "https://a.example", title: "A again" },
      { url: "https://b.example", title: "B" },
    ],
  });
  const { ctx, fiber } = await boot({ baseURL: BASE_URL, language: "en" });
  try {
    assert.equal(fiber.state, 2 /* FiberState.ACTIVE */, "plugin fiber is active");
    const result = await ctx.web.search({ query: "Steen Elektriciteit" });
    assert.equal(urls.length, 1);
    const url = new URL(urls[0]);
    assert.equal(url.origin + url.pathname, `${BASE_URL}/search`);
    assert.equal(url.searchParams.get("q"), "Steen Elektriciteit");
    assert.equal(url.searchParams.get("format"), "json");
    assert.equal(url.searchParams.get("language"), "en");
    assert.equal(url.searchParams.has("categories"), false);
    assert.deepEqual(result.sources.map((s) => s.url), ["https://a.example", "https://b.example"]);
  } finally {
    await fiber.dispose();
  }
});

test("a live config change reaches the next search without re-registering", async () => {
  const urls = stubFetch({ query: "q", results: [] });
  const { ctx, fiber, plugin } = await boot({ baseURL: BASE_URL, language: "en" });
  try {
    const next = plugin.Config({ baseURL: "http://other.test", language: "nl" });
    updateVolatile(fiber.config.baseURL, next.baseURL);
    updateVolatile(fiber.config.language, next.language);
    await ctx.web.search({ query: "x" });
    const url = new URL(urls[0]);
    assert.equal(url.origin, "http://other.test");
    assert.equal(url.searchParams.get("language"), "nl");
  } finally {
    await fiber.dispose();
  }
});
