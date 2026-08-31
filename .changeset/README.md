# Changesets

`@changesets/cli` **is** installed, and this directory is the live source of the
version bump and the changelog. Session 6 took path 1 of the two the previous
version of this file offered; path 2 (delete the directory, hand-write
`CHANGELOG.md`) is not taken. See `docs/DECISIONS.md` ADR-015.

## What changesets owns, and what it does not

| | Owned by |
|---|---|
| the version number in `packages/js/package.json` | `changeset version` |
| `packages/js/CHANGELOG.md` | `changeset version` |
| **publishing to npm** | `.github/workflows/publish-npm.yml`, on a `v*` tag |
| **publishing to PyPI** | `.github/workflows/publish-pypi.yml`, on the same `v*` tag |
| **the git tag** | a human, by hand |

`.github/workflows/release.yml` runs `changeset version` and opens a
"chore: version packages" PR. It has **no `publish:` input**, and that is the
entire design: `packages/python` is not a pnpm workspace member, so changesets
cannot see it and could never publish it. If changesets published npm directly,
PyPI would need a second, divergent release path -- two mechanisms for one
release, and the same-number-same-data guarantee gone.

## Adding a changeset

```bash
pnpm changeset          # pick a bump level, write the note
```

Write it in the session that makes the change, while the reasoning is still at
hand. That is the only time an accurate changelog entry gets written.

## Releasing

```bash
# 1. merge the "chore: version packages" PR that release.yml opened
git switch main && git pull

# 2. tag it. One tag, two registries, one version.
git tag "v$(node -p "require('./packages/js/package.json').version")"
git push origin --tags
```

The tag is what publishes. Nothing else does.
