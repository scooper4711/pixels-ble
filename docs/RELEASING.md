# Releasing

This document describes how to cut a release of `@scooper4711/pixels-ble` and publish it to NPM.

## Overview

Releases are automated via a release script and GitHub Actions:

1. Run `./scripts-build/release.sh` to determine the version, update the changelog, tag, and push.
2. The script creates a draft GitHub Release with the changelog entry.
3. You review and publish the draft.
4. The `release.yml` workflow triggers, builds the package, and stages it on NPM with provenance attestation (via OIDC trusted publishing).
5. You approve the staged package with 2FA.

## Prerequisites

- Push access to the `main` branch.
- OIDC trusted publishing configured on npmjs.com for the `@scooper4711/pixels-ble` package (repository: `scooper4711/pixels-ble`, workflow: `release.yml`, environment: `npm`).
- 2FA enabled on your npmjs.com account (required to approve staged packages).
- GPG or SSH signing configured locally for signed tags (`git config tag.gpgsign true`).

## Initial Setup

These are one-time configuration steps for the repository and npm package. They harden the release pipeline against supply-chain attacks.

### GitHub Repository Settings

Configure at: `https://github.com/scooper4711/pixels-ble/settings`

**Branch protection for `main`:**
- Settings → Branches → Add rule for `main`
- Require signed commits
- Require status checks to pass before merging (select `lint-test-build` and `sonar`)
- Require linear history
- Do not allow force pushes
- Do not allow deletions

**Tag protection:**
- Settings → Tags → Add rule: `v*`
- Prevents deletion or overwriting of version tags

**Rulesets (optional, more granular alternative):**
- Settings → Rules → Rulesets → New ruleset
- Target: tags matching `v*`
- Rules: require signed tags, block deletions, block force pushes

### GitHub Environment

- Settings → Environments → Create `npm`
- Add deployment protection rule: require reviewers (optional extra gate)
- No secrets needed (OIDC handles authentication)

### npm Package Settings

Configure at: `https://www.npmjs.com/package/@scooper4711/pixels-ble/access`

**Trusted publisher:**
- Repository owner: `scooper4711`
- Repository name: `pixels-ble`
- Workflow filename: `release.yml`
- Environment: `npm`

**Restrict publishing method:**
- Disable token-based publishing entirely — only OIDC (trusted publisher) can stage packages
- This ensures even a leaked token cannot publish

**Staged publishing:**
- Enabled by default when using `npm stage publish`
- All versions require 2FA approval before becoming installable

### Local Signing

Ensure your local git is configured for signed commits and tags:

```bash
git config commit.gpgsign true
git config tag.gpgsign true
```

The release script uses `git tag -s` to create signed tags. Consumers can verify tag authenticity with `git verify-tag v0.1.2`.

### Verifying the Supply Chain

Consumers can verify the package at multiple levels:

```bash
# Verify npm provenance
npm audit signatures

# Verify GitHub artifact attestation
gh attestation verify $(npm pack @scooper4711/pixels-ble) --owner scooper4711

# Verify git tag signature
git verify-tag v0.1.2
```

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
6. Create a signed, annotated tag
7. Push main and the tag to origin
8. Create a draft GitHub Release using the changelog entry
9. Print the URL to review and publish the draft

### 2. Publish the Release

Open the draft release URL printed by the script. Review the notes, then click "Publish release." This triggers the `release.yml` workflow which builds and stages the package on NPM.

### 3. Approve the Staged Package

After CI completes, the package is in NPM's staging queue — not yet publicly installable. Approve it with 2FA:

**Using the CLI:**

```bash
npm stage list @scooper4711/pixels-ble
npm stage approve <stage-id>
```

**Using npmjs.com:**

Go to your [Staged Packages](https://www.npmjs.com/settings/scooper4711/staged-packages) tab, review, and click "Approve."

Once approved, the version becomes publicly available on the registry.

### 4. Verify

Monitor the workflow: `https://github.com/scooper4711/pixels-ble/actions/workflows/release.yml`

Verify on NPM after approval: `https://www.npmjs.com/package/@scooper4711/pixels-ble`

## Version Policy

- The package follows [Semantic Versioning 2.0.0](https://semver.org/).
- While the package is at `0.x.y`, minor bumps may contain breaking changes. Document these clearly in the changelog.
- The `1.0.0` release signals a stable public API. After that, breaking changes require a major bump.

## Troubleshooting

### Workflow fails at "Stage publish to NPM"

- Verify OIDC trusted publishing is configured on npmjs.com for the correct repository, workflow filename, and environment.
- Ensure the `npm` environment exists in GitHub repo settings (Settings → Environments).
- Check that `id-token: write` permission is set in the workflow.

### Version conflict (package already exists)

NPM does not allow republishing a version. If a version was published and needs correction:

1. Unpublish the broken version within 72 hours: `npm unpublish @scooper4711/pixels-ble@0.2.0`
2. Delete the GitHub Release and tag.
3. Fix the issue, then re-release with the same version.

Alternatively, bump to the next patch version and release again.

### Tests pass locally but fail in CI

- Check Node version differences (CI tests on Node 20 and 22).
- The CI environment does not have Web Bluetooth APIs — tests must mock BLE interfaces.
