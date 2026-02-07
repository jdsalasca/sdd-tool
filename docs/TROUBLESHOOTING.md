# Troubleshooting

## Windows: command not found after install

If `sdd-cli` is not found after a local install, use a global install:

```
npm i -g sdd-cli
```

## Windows: EEXIST or EPERM during global install

On Windows with nvm, you may see:
- `EEXIST: file already exists` for `sdd`
- `EPERM: operation not permitted` during cleanup

Fix:

```
Remove-Item -Force C:\ProgramData\nvm\v22.17.0\sdd
Remove-Item -Recurse -Force C:\ProgramData\nvm\v22.17.0\node_modules\sdd-cli
npm i -g sdd-cli
```

If that still fails, run PowerShell as Administrator and retry.

## npm publish: missing or invalid token (`E401`, `E403`)

Symptoms:
- `npm ERR! code E401` / auth required
- `npm ERR! code E403` / permission denied

Fix:
1) Create an npm automation token with publish permissions.
2) Add it as repository secret: `NPM_TOKEN`.
3) Re-run `.github/workflows/npm-publish.yml`.

Local verification:
```bash
npm whoami
```

## npm publish: tag/version mismatch

Symptom:
- publish workflow fails with `SDD-3003` (`tag` and `package.json` version mismatch)

Fix:
1) Update `package.json` version to match `vX.Y.Z`.
2) Re-tag and push the correct tag.

Check command:
```bash
npm run verify:release-tag -- --tag vX.Y.Z
```

## npm publish: package content missing files

Symptom:
- publish verification fails with `SDD-3017`

Fix:
1) Ensure required files are generated and included:
   - `dist/cli.js`
   - `dist/cli.d.ts`
   - `package.json`
   - `README.md`
2) Ensure `package.json.files` includes the intended bundle paths.

Check command:
```bash
npm run verify:publish
```

## npm publish: provenance/OIDC issues

Symptom:
- `npm publish --provenance` fails in CI

Fix:
1) Ensure workflow permissions include `id-token: write`.
2) Ensure publish runs on GitHub-hosted runner (OIDC available).
3) Retry once if npm registry latency caused transient failure.
