# Releasing

This document describes how to cut a release of `@scooper4711/pixels-ble` and publish it to NPM.

## Overview

Releases are automated via a release script and GitHub Actions:

1. Run `./scripts-build/release.sh` to determine the version, update the changelog, tag, and push.
2. Create a GitHub Release for the tag (the script prints the URL).
3. The `release.yml` workflow triggers, builds the package, and publishes to NPM with provenance attestation.

## Prerequisites

- Push access to the `main` branch.
- The `NPM_TOKEN` secret is configured in the GitHub repository's `npm` environment (Settings → Environments → `npm` → Secrets).
- The token must have publish permissions for the `@scooper4711` scope on npmjs.com.

## Step-by-Step

### 1. Run the Release Script

```bash
./scripts-build/release.sh           # auto-detect bump from commits
./scripts-build/release.sh patch     # force patch bump
./scripts-build/release.sh minor     # force minor bump
./scripts-build/release.sh major     # force major bump
```

The script will:
1. Analyze commits since the last tag to determine the semver bump
2. Show the commits and proposed version
3. Ask for confirmation
4. Update `CHANGELOG.md` with a generated entry
5. Commit the changelog
6. Create an annotated tag
7. Push main and the tag to origin
8. Create a draft GitHub Release using the changelog entry
9. Print the URL to review and publish the draft

### 2. Publish the Release

Open the draft release URL printed by the script. Review the notes, then click "Publish release." This triggers the `release.yml` workflow which builds and publishes to NPM.

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
