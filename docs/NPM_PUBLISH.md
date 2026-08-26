# First-time npm publish (API Glimpse packages)

This guide is for Nick publishing `@apiglimpse/*` for the first time. You do **not** need prior npm experience. Follow the steps in order. Do not skip verification.

**Packages**

| Package | Role |
| --- | --- |
| `@apiglimpse/shared@0.1.0` | Internal helpers (sample format + redaction). Customers usually do not install this. Publish it first so middleware can depend on it from the registry. |
| `@apiglimpse/middleware@0.1.0` | Public SDK. What app developers install. Express middleware that sends API traffic metadata to API Glimpse (`collect.apiglimpse.com`). |
| `@apiglimpse/fastify@0.1.0` | Public SDK for Fastify (same envelope as Express). Publish after shared, with the same `publish:npm` swap pattern. |

Local monorepo development keeps `"@apiglimpse/shared": "file:../shared"` in middleware and fastify. Do **not** change that permanently. Use each package’s publish script, which swaps to `^0.1.0` only for the publish, then restores `file:../shared`.

**Other languages (PyPI / Go modules)** are not published via npm — see **[CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md)** for the full multi-language publish playbook.

---

## 1. Create or log in to an npm account

1. Open [https://www.npmjs.com/signup](https://www.npmjs.com/signup) (or [login](https://www.npmjs.com/login) if you already have an account).
2. Use an email you can access. Confirm the email if npm asks.
3. Remember your username — you will need it for the org and for `npm whoami`.

---

## 2. Enable two-factor authentication (2FA)

npm often requires 2FA before you can publish.

1. Log in on the website → click your avatar → **Account**.
2. Open **Two-Factor Authentication** (or **Security**).
3. Enable 2FA. Prefer **Authorization and publishing** (covers publish) if offered.
4. Save backup codes somewhere safe.

If `npm publish` later says you need 2FA or an OTP, open your authenticator app and enter the code when the CLI prompts.

---

## 3. Create the `@apiglimpse` organization (or confirm it exists)

Scoped packages like `@apiglimpse/middleware` live under an npm **organization** (or under your user if the scope matches your username). For `@apiglimpse`, create an org with that name.

1. Open [https://www.npmjs.com/org/create](https://www.npmjs.com/org/create).
2. Organization name: `apiglimpse` (this becomes the `@apiglimpse` scope).
3. Choose a plan. The free/open-source org plan is enough for public packages. If npm only offers paid plans for orgs, complete billing or use whatever plan you intend — publish will fail with **402** if the org cannot publish.
4. After creation, open the org → **Members**.
5. Confirm **you** are an owner or member with publish rights. If you invited yourself from another account, accept the invite.

**Already have the org?** Open [https://www.npmjs.com/settings/apiglimpse/packages](https://www.npmjs.com/settings/apiglimpse/packages) (or search “apiglimpse” under Organizations). Confirm packages list is empty or only what you expect, and that you are a member.

---

## 4. Log in from the terminal

From any directory on your machine:

```bash
npm login
```

Follow the prompts (username, password, email, OTP if 2FA is on). Newer npm may open a browser for login — finish that flow.

---

## 5. Confirm who you are

```bash
npm whoami
```

**Expected:** your npm username printed alone (e.g. `jantznick`).

If you see `ENEEDAUTH` or “not logged in”, repeat step 4.

---

## 6. Publish `@apiglimpse/shared`

Always publish **shared** before **middleware**.

```bash
cd /Users/nick/repos/api-security/packages/shared
npm publish --access public
```

`--access public` is required for scoped packages on first publish (otherwise npm may try to create a private package and fail or bill).

**Expected output (shape):**

```text
+ @apiglimpse/shared@0.1.0
```

You may also see a tarball packing summary and a notice about the package URL.

**Quick check:**

```bash
npm view @apiglimpse/shared version
```

**Expected:** `0.1.0`

---

## 7. Publish `@apiglimpse/middleware`

Use the script so `file:../shared` is not left pointing at the registry (and so you do not forget to restore it).

```bash
cd /Users/nick/repos/api-security/packages/middleware
npm run publish:npm
```

What the script does:

1. Runs `npm whoami` (fails if not logged in)
2. Runs `npm view @apiglimpse/shared version` (fails if shared is not published yet)
3. Temporarily sets `"@apiglimpse/shared": "^0.1.0"` (or whatever version is on the registry)
4. Runs `npm install`
5. Runs `npm publish --access public`
6. Restores `"@apiglimpse/shared": "file:../shared"` and runs `npm install` again

Optional dry run (packs and validates, does not upload):

```bash
node ./scripts/publish.mjs --dry-run
```

**Expected output (end):** something like `Published @apiglimpse/middleware@0.1.0` and `+ @apiglimpse/middleware@0.1.0` from npm.

### Manual swap (only if you cannot run the script)

```bash
cd /Users/nick/repos/api-security/packages/middleware
```

1. Edit `package.json`: change `"@apiglimpse/shared": "file:../shared"` to `"@apiglimpse/shared": "^0.1.0"`.
2. Run `npm install`
3. Run `npm publish --access public`
4. Change the dependency **back** to `"file:../shared"`
5. Run `npm install` again

---

## 8. Verify on the registry

```bash
npm view @apiglimpse/shared version
npm view @apiglimpse/middleware version
npm view @apiglimpse/middleware dependencies
```

**Expected:**

- Both versions: `0.1.0`
- Middleware dependency: `@apiglimpse/shared` at a semver range like `^0.1.0` (not `file:../shared`)

Also open in a browser:

- [https://www.npmjs.com/package/@apiglimpse/shared](https://www.npmjs.com/package/@apiglimpse/shared)
- [https://www.npmjs.com/package/@apiglimpse/middleware](https://www.npmjs.com/package/@apiglimpse/middleware)

---

## 9. Test install in a throwaway folder

This confirms a clean machine can install the public SDK the same way customers will.

```bash
mkdir -p /tmp/apiglimpse-npm-test
cd /tmp/apiglimpse-npm-test
npm init -y
npm i @apiglimpse/middleware
node -e "import('@apiglimpse/middleware').then(m => console.log(Object.keys(m)))"
```

**Expected:** install succeeds; printed keys include `apiSensor` (and possibly `default`).

When done you can delete the folder:

```bash
rm -rf /tmp/apiglimpse-npm-test
```

---

## 10. Common errors

| Symptom | Likely cause | What to do |
| --- | --- | --- |
| `403` / “You do not have permission” / “not allowed to publish” | Not a member of the `@apiglimpse` org, wrong account, or org package permissions | `npm whoami`; check org Members; log in as the owner; ensure scope is `apiglimpse` |
| `402` Payment required | Org/plan does not allow the publish (private by default, or paid-only org) | Use `--access public`; fix org billing/plan for public packages |
| `ENEEDAUTH` / 401 | Not logged in | `npm login` then `npm whoami` |
| Package name taken / conflict | Someone else owns `@apiglimpse/...` or version already published | Confirm org ownership; for a new release bump `version` in `package.json` (you cannot republish the same version) |
| Scoped package private / “must be paid” | Missing public access | Always use `npm publish --access public` (or rely on `publishConfig.access: "public"` already in both packages) |
| Middleware publish: shared not found | Shared not published yet | Publish `packages/shared` first (section 6) |
| OTP / 2FA required | 2FA enabled | Enter authenticator code when prompted; enable 2FA if npm requires it |
| `EPUBLISHCONFLICT` | That version already exists | Bump version (e.g. `0.1.1`) in both packages if needed; publish shared first when shared changed |

---

## Commands in order (checklist)

```bash
# Account / session
npm login
npm whoami

# 1) Shared
cd /Users/nick/repos/api-security/packages/shared
npm publish --access public
npm view @apiglimpse/shared version

# 2) Middleware (script swaps file: → ^version, publishes, restores file:)
cd /Users/nick/repos/api-security/packages/middleware
npm run publish:npm
npm view @apiglimpse/middleware version

# 3) Fastify (same swap script)
cd /Users/nick/repos/api-security/packages/fastify
npm run publish:npm
npm view @apiglimpse/fastify version

# 4) Smoke test
mkdir -p /tmp/apiglimpse-npm-test && cd /tmp/apiglimpse-npm-test
npm init -y
npm i @apiglimpse/middleware @apiglimpse/fastify
```

Do **not** commit a middleware/fastify `package.json` that depends on `^0.1.0` for day-to-day monorepo work — keep `file:../shared` after publish (the script restores this).

---

## 11. Publish `@apiglimpse/fastify`

Same pattern as middleware. Shared must already be on the registry.

```bash
cd /Users/nick/repos/api-security/packages/fastify
npm run publish:npm
npm view @apiglimpse/fastify version
```

Dry run: `node ./scripts/publish.mjs --dry-run`.

Smoke:

```bash
mkdir -p /tmp/apiglimpse-fastify-test && cd /tmp/apiglimpse-fastify-test
npm init -y
npm i @apiglimpse/fastify
```

---

## Later releases

1. Bump `version` in `packages/shared/package.json` and/or `packages/middleware/package.json` / `packages/fastify/package.json`.
2. If shared changed, publish shared first, then each dependent (`npm run publish:npm`).
3. If only one connector changed, you can publish that package alone (script still requires shared to exist on the registry).

---

## Related

- [CONNECTOR_PUBLISH.md](./CONNECTOR_PUBLISH.md) — npm + PyPI + Go module publish (all connectors)
- [INTEGRATING.md](./INTEGRATING.md) — customer install (Express, Fastify, FastAPI, Go)
- [DEPLOY.md](./DEPLOY.md) — production checklist (includes npm)
- Package READMEs: `packages/shared/README.md`, `packages/middleware/README.md`, `packages/fastify/README.md`
