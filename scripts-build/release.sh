#!/usr/bin/env bash
#
# Determines the next semantic version based on conventional commits
# since the last tag, updates CHANGELOG.md, creates an annotated tag,
# and pushes the tag to trigger the release workflow.
#
# Usage:
#   ./scripts-build/release.sh           # auto-detect bump type
#   ./scripts-build/release.sh patch     # force patch bump
#   ./scripts-build/release.sh minor     # force minor bump
#   ./scripts-build/release.sh major     # force major bump
#
set -euo pipefail

# Abort if the working tree is dirty
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

FORCE_BUMP=""

for arg in "$@"; do
  case "$arg" in
    patch|minor|major) FORCE_BUMP="$arg" ;;
    *) echo "Error: Unknown argument '$arg'. Use patch, minor, or major."; exit 1 ;;
  esac
done

# Get the latest semver tag
LATEST_TAG=$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)

if [[ -z "$LATEST_TAG" ]]; then
  echo "No existing version tags found. Starting at v0.1.0"
  NEXT_TAG="v0.1.0"
  COMMITS_SINCE=""
else
  # Parse current version
  VERSION="${LATEST_TAG#v}"
  MAJOR=$(echo "$VERSION" | cut -d. -f1)
  MINOR=$(echo "$VERSION" | cut -d. -f2)
  PATCH=$(echo "$VERSION" | cut -d. -f3)

  echo "Current version: $LATEST_TAG"

  if [[ -n "$FORCE_BUMP" ]]; then
    BUMP="$FORCE_BUMP"
    echo "Forced bump type: $BUMP"
  else
    # Analyze commits since last tag to determine bump type
    BUMP="patch"
    BUMP_REASON="no feat or breaking change commits found (defaulting to patch)"
    while IFS= read -r subject; do
      if echo "$subject" | grep -qE '^feat(\(.+\))?!:|^fix(\(.+\))?!:|^refactor(\(.+\))?!:|BREAKING CHANGE'; then
        BUMP="major"
        BUMP_REASON="breaking change: $subject"
        break
      elif echo "$subject" | grep -qE '^feat(\(.+\))?:'; then
        BUMP="minor"
        BUMP_REASON="new feature: $subject"
      fi
    done <<< "$(git log "${LATEST_TAG}..HEAD" --format='%s')"

    echo "Detected bump type: $BUMP"
    echo "  Reason: $BUMP_REASON"
  fi

  # Calculate next version
  case "$BUMP" in
    major) NEXT_TAG="v$((MAJOR + 1)).0.0" ;;
    minor) NEXT_TAG="v${MAJOR}.$((MINOR + 1)).0" ;;
    patch) NEXT_TAG="v${MAJOR}.${MINOR}.$((PATCH + 1))" ;;
  esac

  COMMITS_SINCE=$(git log "${LATEST_TAG}..HEAD" --format='%s')
fi

# Show what will happen
echo ""
echo "Commits since ${LATEST_TAG:-beginning}:"
if [[ -n "$LATEST_TAG" ]]; then
  git log "${LATEST_TAG}..HEAD" --oneline
else
  git log --oneline
fi

echo ""
echo "Next version: $NEXT_TAG"
echo ""

# Confirm with user
read -rp "Create and push tag $NEXT_TAG? [y/N] " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 0
fi

# Update CHANGELOG.md
NEXT_VERSION="${NEXT_TAG#v}"
TODAY=$(date +%Y-%m-%d)
REPO_URL=$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/' | sed 's/.*github.com[:/]\(.*\)$/\1/')

# Build changelog entry from conventional commits
CHANGELOG_ENTRY="## [${NEXT_VERSION}] - ${TODAY}"
ADDED=""
FIXED=""
CHANGED=""

if [[ -n "$LATEST_TAG" ]]; then
  while IFS= read -r subject; do
    if echo "$subject" | grep -qE '^feat(\(.+\))?:'; then
      MSG=$(echo "$subject" | sed 's/^feat\([^)]*\)\?: //')
      ADDED="${ADDED}\n- ${MSG}"
    elif echo "$subject" | grep -qE '^fix(\(.+\))?:'; then
      MSG=$(echo "$subject" | sed 's/^fix\([^)]*\)\?: //')
      FIXED="${FIXED}\n- ${MSG}"
    elif echo "$subject" | grep -qE '^refactor(\(.+\))?:|^chore(\(.+\))?:|^docs(\(.+\))?:'; then
      MSG=$(echo "$subject" | sed 's/^[a-z]*\([^)]*\)\?: //')
      CHANGED="${CHANGED}\n- ${MSG}"
    fi
  done <<< "$COMMITS_SINCE"
else
  ADDED="\n- Initial release"
fi

if [[ -n "$ADDED" ]]; then
  CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n\n### Added${ADDED}"
fi
if [[ -n "$FIXED" ]]; then
  CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n\n### Fixed${FIXED}"
fi
if [[ -n "$CHANGED" ]]; then
  CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n\n### Changed${CHANGED}"
fi

CHANGELOG_ENTRY="${CHANGELOG_ENTRY}\n\n[${NEXT_VERSION}]: https://github.com/${REPO_URL}/releases/tag/${NEXT_TAG}"

# Insert the new entry after the changelog header
if [[ -f CHANGELOG.md ]]; then
  # Insert after the first "## [" line's preceding blank line, or after the header block
  TEMP_FILE=$(mktemp)
  awk -v entry="$(echo -e "$CHANGELOG_ENTRY")" '
    /^## \[/ && !inserted {
      print entry
      print ""
      inserted=1
    }
    { print }
  ' CHANGELOG.md > "$TEMP_FILE"
  mv "$TEMP_FILE" CHANGELOG.md
else
  echo -e "# Changelog\n\nAll notable changes to this project will be documented in this file.\n\nThe format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),\nand this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).\n\n${CHANGELOG_ENTRY}" > CHANGELOG.md
fi

# Commit the changelog update
git add CHANGELOG.md
git commit -S -m "docs: Update CHANGELOG for ${NEXT_TAG}"

# Create annotated tag and push
git tag -a "$NEXT_TAG" -m "Release ${NEXT_TAG}"
git push origin main
git push origin "$NEXT_TAG"

echo ""
echo "Tag $NEXT_TAG pushed. The release workflow will publish to NPM."
echo "Create a GitHub Release at: https://github.com/${REPO_URL}/releases/new?tag=${NEXT_TAG}"
