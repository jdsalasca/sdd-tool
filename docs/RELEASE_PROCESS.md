# Release process

This document defines the Gitflow release steps for sdd-cli.

## Steps
1) Create a feature branch from `develop`
2) Open PR to `develop`
3) Merge feature PRs into `develop`
4) Create `release/vX.Y.Z` from `develop`
5) Generate notes: `npm run release:notes -- --write --version vX.Y.Z`
6) Generate metrics summary: `npm run release:metrics > docs/releases/vX.Y.Z-metrics.md`
7) Open PR to `main`
8) Merge release PR to `main`
9) Tag `vX.Y.Z` and create GitHub release
10) Merge `main` back into `develop`

