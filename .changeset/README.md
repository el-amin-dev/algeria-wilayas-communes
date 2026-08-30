# Changesets — written here, consumed in session 6

`@changesets/cli` is **not installed**, so `pnpm changeset version` cannot run
today. The actual release path is the git tag: `.github/workflows/publish-npm.yml`
runs `npm version "${GITHUB_REF_NAME#v}"` and publishes.

The changeset file in this directory is therefore **source text, not an active
release mechanism**. It was written in the session that made the changes, while
the reasoning was still at hand, which is the only time an accurate changelog
entry gets written. Session 6 owns the decision between two paths:

1. adopt changesets properly — add the CLI, and let it own the version bump; or
2. drop this directory and fold the prose into `CHANGELOG.md`, keeping the tag
   as the single source of the version.

Until then, do not add a second release model on top of the tag. Two live
release paths is worse than one inert one.
