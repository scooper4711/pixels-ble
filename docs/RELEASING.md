# Releasing

This document describes how to cut a release of `@scooper4711/pixels-ble` and publish it to NPM.

## Overview

Releases are automated via GitHub Actions. The workflow is:

1. You create a GitHub Release with a semver tag.
2. The `release.yml` workflow triggers, builds the package, and publishes to NPM with provenance attestation.

There is no manual `npm publish` step.

## Prerequisites

- Push access to the `main` branch.
- The `NPM_TOKEN` secret is configured in the GitHub repository's `npm` environment (Settings → Environments → `npm` → Secrets).
- The token must have publish permissions for the `@scooper4711` scope on npmjs.com.

## Step-by-Step

### 1. Determine the Next Version

Review commits since the last release to determine the appropriate semver bump:

```bash
# See commits since last tag
git log $(git describe --tags --abbrev=0)..HEAD --oneline
```

| Commit type | Version bump |
|-------------|-------------|
| `fix:` | Patch (0.1.0 → 0.1.1) |
| `feat:` | Minor (0.1.0 → 0.2.0) |
| `feat!:`, `fix!:`, or `BREAKING CHANGE` in body | Major (0.1.0 → 1.0.0) |

### 2. Update the Changelog

Add a new section to `CHANGELOG.md` above the previous release:

```markdown
## [0.2.0] - 2025-08-15

### Added
- Description of new features

### Fixed
- Description of bug fixes

### Changed
- Description of changes

[0.2.0]: https://github.com/scooper4711/pixels-ble/releases/tag/v0.2.0
```

Commit the changelog update:

```bash
git add CHANGELOG.md
git commit -S -m "docs: Update CHANGELOG for v0.2.0"
git push
```

### 3. Create the GitHub Release

You can do this via the GitHub UI or the CLI:

**Using the GitHub CLI:**

```bash
gh release create v0.2.0 \
  --title "v0.2.0" \
  --notes "See [CHANGELOG.md](./CHANGELOG.md#020---2025-08-15) for details."
```

**Using the GitHub UI:**

1. Go to the repository → Releases → "Draft a new release"
2. Tag: `v0.2.0` (create new tag on publish)
3. Target: `main`
4. Title: `v0.2.0`
5. Description: summarize changes or link to the changelog
6. Click "Publish release"

### 4. Verify the Publish

Once the release is published, the `release.yml` workflow will:

1. Check out the code at the tag
2. Run type checking, tests, and build
3. Set the package version from the tag (strips the `v` prefix)
4. Publish to NPM with `--provenance --access public`

Monitor the workflow at: `https://github.com/scooper4711/pixels-ble/actions/workflows/release.yml`

Verify on NPM: `https://www.npmjs.com/package/@scooper4711/pixels-ble`

### 5. Post-Release

No additional steps required. The tag and GitHub Release serve as the version record. The published package includes provenance attestation, allowing consumers to verify the build origin.

## Version Policy

- The package follows [Semantic Versioning 2.0.0](https://semver.org/).
- While the package is at `0.x.y`, minor bumps may contain breaking changes. Document these clearly in the changelog.
- The `1.0.0` release signals a stable public API. After that, breaking changes require a major bump.

## Troubleshooting

### Workflow fails at "Publish to NPM"

- Verify the `NPM_TOKEN` secret exists in the `npm` environment.
- Verify the token has not expired (NPM tokens can be set to expire).
- Verify the token has publish permissions for `@scooper4711/pixels-ble`.

### Version conflict (package already exists)

NPM does not allow republishing a version. If a version was published and needs correction:

1. Unpublish the broken version within 72 hours: `npm unpublish @scooper4711/pixels-ble@0.2.0`
2. Delete the GitHub Release and tag.
3. Fix the issue, then re-release with the same version.

Alternatively, bump to the next patch version and release again.

### Tests pass locally but fail in CI

- Check Node version differences (CI tests on Node 20 and 22).
- The CI environment does not have Web Bluetooth APIs — tests must mock BLE interfaces.
