# @apiglimpse/shared

Internal helpers used by the Express middleware: request sample format and redaction.

Customers usually do **not** install this package directly. It is published so `@apiglimpse/middleware` can depend on it from the npm registry. Install the middleware instead.

## What it does

- Builds the sample / envelope shape sent to API Glimpse (`collect.apiglimpse.com`)
- Redacts sensitive headers and shapes request/response bodies (structure only, not raw secrets)

## Install (rare)

```bash
npm install @apiglimpse/shared
```

Prefer:

```bash
npm install @apiglimpse/middleware
```

## Maintainer publish

Publish this package **before** `@apiglimpse/middleware`. Full first-time guide: [docs/NPM_PUBLISH.md](../../docs/NPM_PUBLISH.md).

```bash
cd packages/shared
npm publish --access public
```
