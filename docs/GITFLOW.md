# Gitflow

Branch strategy for this repo:

- `main`: release-ready snapshots
- `develop`: integration branch
- `feature/*`: feature work
- `hotfix/*`: urgent fixes
- `release/*`: release preparation

## Workflow
1) Create feature branch from `develop`
2) Merge feature into `develop`
3) Cut `release/*` from `develop` when ready
4) Merge release into `main` and `develop`
