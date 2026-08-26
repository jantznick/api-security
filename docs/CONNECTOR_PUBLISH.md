# Publish connectors (npm / PyPI / Go)

Maintainer guide for shipping **language connectors** the same way we ship Express via npm.

**Important:** Connectors are **client SDKs**, not extra hosted “language agents.” There is still **one** collector at `https://collect.apiglimpse.com` (Railway). Publishing a connector means putting an installable package on a public registry so customers can `npm install` / `pip install` / `go get` it and point at that same URL.

Customer install after publish: [INTEGRATING.md](./INTEGRATING.md). Wire format: [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md). Express-only deep dive: [NPM_PUBLISH.md](./NPM_PUBLISH.md).

---

## What gets published where

| Connector | Package / module | Registry | Repo path |
| --- | --- | --- | --- |
| Shared helpers (JS) | `@apiglimpse/shared` | npm | `packages/shared` |
| Express | `@apiglimpse/middleware` | npm | `packages/middleware` |
| Fastify | `@apiglimpse/fastify` | npm | `packages/fastify` |
| FastAPI / Starlette | `apiglimpse` | PyPI | `connectors/python` |
| Go (chi / `net/http`) | `github.com/jantznick/api-security/connectors/go` | Go module proxy (git tags) | `connectors/go` |

**Hosted agent / ingest / core** are **not** published as SDKs. Deploy those with [DEPLOY.md](./DEPLOY.md) / [RAILWAY.md](./RAILWAY.md). Connectors only talk to the public agent URL.

---

## Prerequisites (all registries)

1. Collector live: `GET https://collect.apiglimpse.com/health` → ok.
2. Dashboard can mint `ask_…` keys (customers need these regardless of language).
3. You have maintainer accounts for the registries you are publishing to (npm org, PyPI, GitHub push for tags).

Nick-only accounts (same idea as N2 in [PARALLEL_PLAN.md](./PARALLEL_PLAN.md)):

| Registry | Account you need |
| --- | --- |
| npm | `@apiglimpse` org + 2FA — [NPM_PUBLISH.md](./NPM_PUBLISH.md) §§1–5 |
| PyPI | [pypi.org](https://pypi.org) account (+ optional TestPyPI) with 2FA; API token recommended |
| Go | Push access to `jantznick/api-security` so you can create version tags |

---

## A. npm — shared, Express, Fastify

Same org and login flow as the Express first publish. Full handholding: **[NPM_PUBLISH.md](./NPM_PUBLISH.md)**.

### Publish order

1. `@apiglimpse/shared` (if version not already on the registry, or shared changed)
2. `@apiglimpse/middleware` (Express)
3. `@apiglimpse/fastify`

Middleware and Fastify both keep `"@apiglimpse/shared": "file:../shared"` in the monorepo. Use each package’s `npm run publish:npm` script so it swaps to `^x.y.z`, publishes, then restores `file:`.

```bash
# 1) Shared (first time or after shared changes)
cd packages/shared
npm publish --access public
npm view @apiglimpse/shared version

# 2) Express
cd ../middleware
npm run publish:npm
npm view @apiglimpse/middleware version

# 3) Fastify
cd ../fastify
npm run publish:npm
npm view @apiglimpse/fastify version
```

Dry-run without uploading:

```bash
cd packages/fastify && node ./scripts/publish.mjs --dry-run
```

### Customer install (after publish)

```bash
npm install @apiglimpse/middleware   # Express
npm install @apiglimpse/fastify      # Fastify
```

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_…
```

### Smoke (throwaway folder)

```bash
mkdir -p /tmp/apiglimpse-npm-test && cd /tmp/apiglimpse-npm-test
npm init -y
npm i @apiglimpse/middleware @apiglimpse/fastify
node -e "import('@apiglimpse/fastify').then(m => console.log(Object.keys(m)))"
```

---

## B. PyPI — `apiglimpse` (FastAPI)

Python does **not** use npm. Customers install from PyPI the same way Node customers use npm.

### One-time setup

1. Create / log in at [https://pypi.org](https://pypi.org) (and optionally [https://test.pypi.org](https://test.pypi.org)).
2. Enable 2FA.
3. Account → **API tokens** → create a token scoped to the whole account (first publish) or to project `apiglimpse` (later).
4. On your machine:

```bash
python3 -m pip install --upgrade build twine
```

Configure credentials (preferred: API token as password; username is `__token__`):

```bash
# ~/.pypirc example (do not commit this file)
# [pypi]
# username = __token__
# password = pypi-AgEIcHlwaS5vcmc...
```

Or pass `-u __token__ -p pypi-...` to `twine upload`.

### Build and publish

From the repo root (version is in `connectors/python/pyproject.toml`, currently `0.1.0`):

```bash
cd connectors/python

# Optional: tests first
python3 -m pip install -e ".[dev]"
pytest

# Build sdist + wheel into dist/
rm -rf dist build *.egg-info
python3 -m build

# Optional: TestPyPI first
# python3 -m twine upload --repository testpypi dist/*

# Production PyPI
python3 -m twine upload dist/*
```

**Expected:** Twine reports upload of `apiglimpse-0.1.0.tar.gz` and a matching wheel.

### Verify

```bash
python3 -m pip index versions apiglimpse
# or:
pip install apiglimpse==0.1.0
python3 -c "from apiglimpse import ApiGlimpseMiddleware; print(ApiGlimpseMiddleware)"
```

Package page: [https://pypi.org/project/apiglimpse/](https://pypi.org/project/apiglimpse/)

### Customer install (after publish)

```bash
pip install apiglimpse
```

```python
from fastapi import FastAPI
from apiglimpse import ApiGlimpseMiddleware

app = FastAPI()
app.add_middleware(
    ApiGlimpseMiddleware,
    agent_url="https://collect.apiglimpse.com",
    api_key="ask_…",
)
```

Env vars are the same as Node: `API_SENSOR_AGENT_URL`, `API_SENSOR_KEY`, optional `API_SENSOR_SAMPLE_RATE`.

### Later releases

1. Bump `version` in `connectors/python/pyproject.toml`.
2. Rebuild + `twine upload` (you cannot overwrite an existing version).
3. Update [INTEGRATING.md](./INTEGRATING.md) / demo `requirements.txt` if they pin a version.

### Common PyPI errors

| Symptom | What to do |
| --- | --- |
| 403 / invalid credentials | Use username `__token__` and a PyPI API token as password |
| File already exists | Bump version; cannot re-upload `0.1.0` |
| Package name taken | Confirm you own `apiglimpse` on PyPI; rename only as a last resort |

---

## C. Go module — chi / `net/http`

Go modules are published by **pushing a git tag**. The Go module proxy (`proxy.golang.org`) fetches that tag from GitHub. There is no separate “npm publish” upload step.

### Module identity

- Module path: `github.com/jantznick/api-security/connectors/go` (`connectors/go/go.mod`)
- Import path for middleware: `github.com/jantznick/api-security/connectors/go/apiglimpse`

Because the module lives in a **subdirectory**, the version tag **must** include the module directory prefix:

```text
connectors/go/v0.1.0
```

Not `v0.1.0` at repo root (that would version the wrong module path).

### Publish steps

1. Ensure `connectors/go` on `main` is the code you want to release.
2. Run tests:

```bash
cd connectors/go
go test ./...
```

3. Create and push an annotated tag from the repo root (after the commit is on `origin/main`):

```bash
git fetch origin main
git checkout main
git pull origin main

git tag -a connectors/go/v0.1.0 -m "apiglimpse Go connector v0.1.0"
git push origin connectors/go/v0.1.0
```

4. Force the public proxy to fetch it (optional but useful for immediate smoke):

```bash
GOPROXY=https://proxy.golang.org go list -m github.com/jantznick/api-security/connectors/go@v0.1.0
```

### Customer install (after tag)

```bash
go get github.com/jantznick/api-security/connectors/go/apiglimpse@v0.1.0
```

```go
import "github.com/jantznick/api-security/connectors/go/apiglimpse"

r.Use(apiglimpse.Middleware(apiglimpse.Config{
  AgentURL: "https://collect.apiglimpse.com",
  APIKey:   os.Getenv("API_SENSOR_KEY"),
}))
```

Same env vars: `API_SENSOR_AGENT_URL`, `API_SENSOR_KEY`, `API_SENSOR_SAMPLE_RATE`.

### Local monorepo / demo

Demos use a `replace` directive so they do not need a published tag:

```go
replace github.com/jantznick/api-security/connectors/go => ../../connectors/go
```

Do **not** leave that `replace` in customer apps once the module is tagged.

### Later releases

1. Land changes on `main`.
2. Tag `connectors/go/v0.1.1` (semver; never reuse a tag).
3. `git push origin connectors/go/v0.1.1`.

### Common Go errors

| Symptom | What to do |
| --- | --- |
| `go get` cannot find version | Tag prefix wrong — must be `connectors/go/vX.Y.Z`; wait a few minutes for proxy |
| Wrong code at version | Tags are immutable — cut a new patch version |
| Private module / 404 | Repo must be public (or customers need GOPRIVATE + auth) |

---

## End-to-end smoke (any language)

After the package is on its registry:

1. Create a project + `ask_…` key in the dashboard.
2. Install the connector from the **public** registry (not `file:` / `pip -e` / `replace`).
3. Set:

```bash
API_SENSOR_AGENT_URL=https://collect.apiglimpse.com
API_SENSOR_KEY=ask_…
```

4. Hit a few routes → inventory appears.
5. Confirm `POST https://collect.apiglimpse.com/v1/samples` without a key → **401**.

Demos in-repo (local paths, good before first publish):

| Demo | Path |
| --- | --- |
| Express | `demo/express-app` |
| Fastify | `demo/fastify-app` |
| FastAPI | `demo/fastapi-app` |
| Go chi | `demo/go-chi-app` |

---

## Checklist (first multi-language launch)

- [ ] npm: `@apiglimpse/shared`, `@apiglimpse/middleware`, `@apiglimpse/fastify` visible on npmjs.com
- [ ] PyPI: `apiglimpse` installable via `pip install apiglimpse`
- [ ] Go: tag `connectors/go/v0.1.0` pushed; `go get …@v0.1.0` works
- [ ] [INTEGRATING.md](./INTEGRATING.md) install commands match published names
- [ ] Marketing / docs-site “Coming soon” rows flipped only for packages that are actually published
- [ ] Soft-launch smoke with at least one non-Express connector against `collect.apiglimpse.com`

---

## Related

- [NPM_PUBLISH.md](./NPM_PUBLISH.md) — first-time npm account / org / Express detail
- [INTEGRATING.md](./INTEGRATING.md) — customer install per framework
- [WIRE_PROTOCOL.md](./WIRE_PROTOCOL.md) — envelope v1 contract
- [DEPLOY.md](./DEPLOY.md) — Railway/Render (hosted agent, not SDKs)
- [LAUNCH_NEXT.md](./LAUNCH_NEXT.md) — ops checklist including package publish
