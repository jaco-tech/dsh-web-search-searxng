# dsh-web-search-searxng

[![dsh-plugin](https://img.shields.io/badge/dsh-plugin-blue)](https://github.com/topics/dsh-plugin)

SearXNG-backed search provider plugin for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

Registers a `WebSearchProvider` into `ctx.web` so that the existing `web_search` model tool routes through your SearXNG instance. No auth, no API key, no model calls — just a plain HTTP GET against SearXNG's JSON endpoint.

## Install

```bash
npm install @jaco-tech/dsh-web-search-searxng
```

## Configure

Add to your DSH profile's `cordis.patch.yml`:

```yaml
- insert:
    - id: web-search-searxng
      name: '@jaco-tech/dsh-web-search-searxng'
      config:
        baseURL: 'http://your-searxng-instance:8888'
        # Optional filters:
        language: 'en'
        categories: 'general'
        timeRange: ''
```

Optionally pin `ctx.web` to use this provider explicitly:

```yaml
- replace:
    - id: web
      config:
        searchProvider: searxng
```

## How it works

This is a [Cordis](https://github.com/cordiverse/cordis) plugin that implements the `WebSearchProvider` interface from `@deepseek-ai/dsh-web`:

```typescript
export const name = "web-search-searxng"
export const inject = ["web"]

export function apply(ctx, config) {
  ctx.web.registerSearchProvider({
    id: "searxng",
    available() { /* URL.canParse(config.baseURL) */ },
    async search(request, signal) {
      // GET /search?q=<query>&format=json
      // maps response to WebSearchResult
    }
  })
}
```

The existing `@deepseek-ai/dsh-tool-web` consumer calls `ctx.web.search()` — your SearXNG instance serves the results automatically.

## Provider interface

| Method | Behavior |
|---|---|
| `available()` | Returns `true` when `baseURL` is a valid URL |
| `search(request, signal?)` | `GET /search` with `q`, `format=json`, optional `language`/`categories`/`time_range` params. Dedupes results by URL. Surfaces `answers` and `infoboxes` as provider-generated answer text. |

## Development

```bash
npm install
npm run build
```

Published to npm as `@jaco-tech/dsh-web-search-searxng`.

## License

MIT