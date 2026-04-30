Cut a new versioned release of DocVault.

## Steps

1. Read `VERSION` to get the current version
2. Run `git log --oneline $(git describe --tags --abbrev=0)..HEAD` to summarise changes since last tag
3. Ask the user to confirm the bump type (MAJOR / MINOR / PATCH) if not already clear from context
4. Use the `release-manager` sub-agent to:
   - Update `VERSION`
   - Prepend a new entry to `CHANGELOG.md`
   - Commit with `chore(release): bump version to x.y.z`
   - Create and push the git tag `vx.y.z`
   - Build and push Docker image tagged `pmananthu/docvault:x.y.z` and `pmananthu/docvault:latest`

Report the new version, changelog summary, and Docker tags pushed when done.
