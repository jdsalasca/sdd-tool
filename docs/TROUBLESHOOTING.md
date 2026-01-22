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
