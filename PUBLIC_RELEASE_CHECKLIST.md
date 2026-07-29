# Public Release Checklist

Use this before creating the public GitHub repository or publishing to npm. For the detailed repeatable process, see [docs/release.md](./docs/release.md).

## Required decisions

- [x] Choose and add a project license. This project uses MIT.
- [x] Decide the public GitHub repository URL and add it to `package.json` metadata.
- [x] Decide the public support/contact path for `SECURITY.md`.
- [x] Confirm the npm package name `@cognicellai/a2a-mcp` is still available.
- [x] Confirm npm user `hhaggerty` is an owner of the `cognicellai` npm org.
- [ ] Configure npm Trusted Publishing for `.github/workflows/release.yml`.

## Local checks

```bash
npm run release:check
npm audit --omit=dev
npm publish --dry-run
```

## Repository hygiene

- [ ] Confirm no `.env`, `.DS_Store`, `*.swp`, `reports/`, or local agent configs are committed.
- [ ] Confirm `configs/stock-guru.codex.yaml` and `scripts/run-stock-guru-codex.sh` remain local-only or are replaced by sanitized examples.
- [ ] Confirm generated `dist/` is not committed unless the release policy intentionally tracks build artifacts.
- [x] Public repository created at `https://github.com/CognicellAI/a2a-mcp`.
- [x] GitHub Actions enabled and conformance workflow passing.
- [x] `main` branch protected with required conformance checks.
- [x] GitHub private vulnerability reporting enabled.

## Release flow

```bash
npm ci
npm run release:check
npm run release:verify-tag -- v0.1.0
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

Pushing the tag runs the release workflow.
