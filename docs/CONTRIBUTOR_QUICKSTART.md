# Contributor Quickstart (15 Minutes)

This guide is the fastest path to make a first high-quality contribution to `sdd-cli`.

## 1) Setup (3-5 minutes)

Requirements:
- Node.js 20+
- npm 10+
- Git

Install dependencies:

```bash
npm install
```

Build and run tests once:

```bash
npm test
```

## 2) Pick a contribution (2 minutes)

Recommended first contribution types:
- Docs clarity improvements in `README.md` and `docs/*`
- Small deterministic error-code hardening (`SDD-xxxx`) in one command
- Test gap fixes in `tests/*.test.js`

Use issues labeled:
- `good first issue`
- `docs`
- `tests`
- `quality`

## 3) Create a branch (1 minute)

```bash
git checkout develop
git pull
git checkout -b feature/<short-scope>
```

## 4) Implement + validate (5 minutes)

Run focused checks while editing:

```bash
npm run dev:smoke
```

Before PR, run full local release checks:

```bash
npm run dev:release-check
```

## 5) Open PR (2 minutes)

Use Conventional Commits, for example:
- `docs: improve contributor quickstart`
- `test: add failure-path coverage for route`
- `feat: add deterministic error code for <command>`

Push and open PR against `develop`:

```bash
git push -u origin feature/<short-scope>
```

Fill:
- `.github/PULL_REQUEST_TEMPLATE.md`

## First PR quality bar

- Scope is small and clear.
- Tests/checks pass locally.
- Docs updated if behavior changes.
- New user-facing failure paths emit `SDD-xxxx` where relevant.
