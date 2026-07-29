# Release Guide

This project uses explicit SemVer tags for releases. The package version in `package.json` is the source of truth, and the Git tag must match it exactly.

For the first public release, the expected version is `0.1.0` and the expected tag is `v0.1.0`.

## Release model

- Version changes are committed before publishing.
- Release tags use `vMAJOR.MINOR.PATCH`, such as `v0.1.0`.
- Prerelease tags use normal SemVer prerelease syntax, such as `v0.2.0-alpha.0`.
- Stable releases publish to npm's `latest` dist-tag.
- Prereleases publish to npm's `next` dist-tag.
- The GitHub Actions release workflow validates that the tag matches `package.json` before publishing.

During `0.x`, treat breaking changes as at least minor releases. For example, use `0.2.0` for a breaking protocol or tool-contract change after `0.1.0`.

## Recommended npm publishing setup

Prefer npm Trusted Publishing with GitHub Actions OIDC instead of long-lived npm automation tokens.

Configure the package on npm with:

- Publisher: GitHub Actions
- Repository: the final public GitHub owner/repository
- Workflow filename: `release.yml`
- Allowed action: `npm publish`

The release workflow uses Node 24 because npm Trusted Publishing requires a modern Node/npm toolchain. It grants `id-token: write` for OIDC and `contents: write` to create the GitHub release.

Important: npm Trusted Publishing requires `package.json` repository metadata to match the GitHub repository. Add `repository`, `bugs`, and `homepage` before the first trusted-publishing release.

## v0.1.0 release checklist

Use this checklist exactly for the initial release.

### 1. Metadata

- [ ] Confirm `package.json` has `"version": "0.1.0"`.
- [x] Add the final GitHub repository URL to `package.json`.
- [x] Add `bugs.url` and `homepage` to `package.json`.
- [ ] Confirm `LICENSE` is present and package license is `MIT`.
- [x] Replace the placeholder contact path in `SECURITY.md`.
- [ ] Remove the temporary README note that says `npm view a2a-mcp` returns 404 after the package is published.

### 2. Hygiene

- [ ] Confirm no `.env`, `.DS_Store`, `*.swp`, `reports/`, `dist/`, `node_modules/`, local Stock Guru config, or IDE files are committed.
- [ ] Confirm `configs/stock-guru.codex.yaml` and `scripts/run-stock-guru-codex.sh` remain local-only.
- [ ] Confirm the npm tarball contents from `npm pack --dry-run` contain only intended files.

### 3. Local verification

```bash
npm ci
npm run release:check
npm audit --omit=dev
npm publish --dry-run
```

### 4. GitHub and npm setup

- [ ] Push the repository to GitHub.
- [ ] Enable GitHub Actions for the repository.
- [ ] Protect the `main` branch.
- [x] Public repository created at `https://github.com/CognicellAI/a2a-mcp`.
- [x] GitHub Actions enabled and conformance workflow passing.
- [x] `main` branch protected with required conformance checks.
- [x] GitHub private vulnerability reporting enabled.
- [ ] Configure npm Trusted Publishing for workflow filename `release.yml`.
- [x] Confirm the package name `a2a-mcp` is still available.

### 5. Create the release

```bash
git checkout main
git pull --ff-only
npm run release:verify-tag -- v0.1.0
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

The tag push starts `.github/workflows/release.yml`, which publishes to npm and creates the GitHub release.

### 6. Post-release verification

```bash
npm view a2a-mcp@0.1.0 version
npm view a2a-mcp dist-tags
npx -y a2a-mcp --help
```

Then verify the GitHub release exists and includes the npm tarball artifact.

## Manual fallback

If Trusted Publishing is not configured yet, publish manually from a clean local checkout:

```bash
npm ci
npm run release:check
npm publish --access public
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

Use this only for the first release or an emergency. Future releases should use the tag-driven GitHub Actions workflow.
