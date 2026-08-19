import z from "@deepseek-ai/schemastery";
import { WebError } from "@deepseek-ai/dsh-web";
import type { Context } from "@deepseek-ai/cordis";
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from "@deepseek-ai/dsh-web";

//#region SearXNG JSON response types
interface SearXngResultItem {
  url: string;
  title?: string | null;
  content?: string | null;
  publishedDate?: string | null;
  engine?: string;
  category?: string;
  score?: number;
}

interface SearXngResponseBody {
  query: string;
  results?: SearXngResultItem[];
  answers?: string[];
  infoboxes?: Array<{ content?: string; infobox?: string; url?: string }>;
  suggestions?: string[];
  unresponsive_engines?: string[];
}
//#endregion

//#region provider
/**
 * Stable id this search provider registers under.
 */
const SEARXNG_PROVIDER_ID = "searxng";

/**
 * Project one SearXNG result item to a normalized source, omitting absent
 * optional fields.
 */
function projectSource(item: SearXngResultItem) {
  return {
    url: item.url,
    ...(item.title != null && item.title.length > 0) ? { title: item.title } : {},
    ...(item.content != null && item.content.length > 0) ? { snippet: item.content } : {},
    ...(item.publishedDate != null && item.publishedDate.length > 0) ? { publishedAt: item.publishedDate } : {},
  };
}

/**
 * Map a SearXNG JSON response to the seam's normalized `WebSearchResult`.
 * Dedupes by URL (SearXNG may return the same URL from multiple engines).
 */
function mapSearXngResponse(body: SearXngResponseBody, maxResults?: number): WebSearchResult {
  const seen = new Set<string>();
  const sources = [];
  const items = body.results ?? [];
  for (const item of items) {
    if (!item.url || item.url.length === 0 || seen.has(item.url)) continue;
    seen.add(item.url);
    sources.push(projectSource(item));
  }

  const truncated = maxResults !== void 0 && sources.length > maxResults;
  if (truncated) sources.length = maxResults;

  // SearXNG may return an answer or infobox — surface as provider-generated
  // answer text.
  let content: string | undefined;
  if (body.answers != null && body.answers.length > 0) {
    content = body.answers.join("\n");
  } else if (body.infoboxes != null && body.infoboxes.length > 0) {
    content = body.infoboxes.map((infobox) => infobox.content ?? infobox.infobox ?? "").filter(Boolean).join("\n\n");
  }

  return { ...content !== void 0 ? { content } : {}, sources, truncated };
}

/**
 * The SearXNG-backed search provider. Every operation issues a plain GET
 * against the instance's JSON endpoint and maps the response directly to the
 * seam's normalized `WebSearchResult`. No auth, no API key, no model calls.
 */
class SearXngSearchProvider implements WebSearchProvider {
  readonly resolveOptions: () => { baseURL: string; language: string; categories: string; timeRange: string };
  readonly id = SEARXNG_PROVIDER_ID;

  constructor(resolveOptions: () => { baseURL: string; language: string; categories: string; timeRange: string }) {
    this.resolveOptions = resolveOptions;
  }

  available(): boolean {
    const options = this.resolveOptions();
    return URL.canParse(options.baseURL);
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const options = this.resolveOptions();
    throwIfAborted(signal);

    const url = new URL(`${options.baseURL}/search`);
    url.searchParams.set("q", request.query);
    url.searchParams.set("format", "json");
    if (options.language) url.searchParams.set("language", options.language);
    if (options.categories) url.searchParams.set("categories", options.categories);
    if (options.timeRange) url.searchParams.set("time_range", options.timeRange);
    url.searchParams.set("pageno", "1");

    throwIfAborted(signal);

    let response: Response;
    try {
      response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "deepseek-harness/0.0.1",
        },
        ...signal !== void 0 ? { signal } : {},
      });
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
      throw new WebError(`SearXNG search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }

    if (!response.ok) {
      let message = `SearXNG API error (HTTP ${response.status})`;
      try {
        const parsed = (await response.json()) as { message?: string };
        if (parsed.message != null && parsed.message.length > 0) message = parsed.message;
      } catch { /* ignore parse failure on error body */ }
      throw new WebError(message, "WEB_PROVIDER_ERROR");
    }

    try {
      return mapSearXngResponse((await response.json()) as SearXngResponseBody, request.maxResults);
    } catch (error) {
      if (signal?.aborted === true || isAbortError(error)) throw aborted(signal, error);
      if (error instanceof WebError) throw error;
      throw new WebError(`SearXNG returned an unprocessable response: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
    }
  }
}

//#endregion

//#region plugin
/**
 * Register a SearXNG-backed search provider in `ctx.web`. No auth, no API
 * key — just point `baseURL` at your SearXNG instance.
 *
 * ## Usage
 *
 * ```yaml
 * # cordis.patch.yml
 * - insert:
 *     - id: web-search-searxng
 *       name: '@jaco-tech/dsh-web-search-searxng'
 *       config:
 *         baseURL: 'http://your-searxng-instance:8888'
 *         language: 'en'
 * ```
 * @module @jaco-tech/dsh-web-search-searxng
 */

/** Cordis plugin name used by loader diagnostics. */
const name = "web-search-searxng";

/** The web seam this provider registers into. */
const inject = ["web"];

/**
 * Plugin configuration. `baseURL` is required (point at your SearXNG instance).
 */
interface Config {
  /** Base URL of the SearXNG instance (without trailing /search). */
  baseURL: string;
  /** Language filter (e.g. "en", "nl", "fr"). Empty = no filter. */
  language?: string;
  /** Categories filter (e.g. "general", "news", "images"). Empty = no filter. */
  categories?: string;
  /** Time range filter (e.g. "day", "week", "month", "year"). Empty = no filter. */
  timeRange?: string;
}

const Config = z.object({
  baseURL: z.string().required(),
  language: z.string().default(""),
  categories: z.string().default(""),
  timeRange: z.string().default(""),
}) as unknown as z<Config>;

function apply(ctx: Context, config: Config): void {
  const current = () => config;
  ctx.web.registerSearchProvider(new SearXngSearchProvider(() => current()));
}
//#endregion

//#region helpers
function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw aborted(signal);
}

function aborted(signal?: AbortSignal, fallback?: unknown): WebError {
  return new WebError("SearXNG search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
//#endregion

export { Config, SEARXNG_PROVIDER_ID, SearXngSearchProvider, apply, inject, name, mapSearXngResponse };