# Release process

This document defines the Gitflow release steps for sdd-cli.

## Steps
1) Create a feature branch from `develop`
2) Open PR to `develop`
3) Merge feature PRs into `develop`
4) Create `release/vX.Y.Z` from `develop`
5) Open PR to `main`
6) Merge release PR to `main`
7) Tag `vX.Y.Z` and create GitHub release
8) Merge `main` back into `develop`

