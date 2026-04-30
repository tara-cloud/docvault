# Versioning Strategy

## 1. Overview

This project follows [Semantic Versioning](https://semver.org):

```
MAJOR.MINOR.PATCH
```

Current version is tracked in [`VERSION`](../VERSION) at the root of the repository.

---

## 2. Version Rules

### MAJOR — Breaking Changes

Increment MAJOR when:

- Database schema changes that break existing data (column removed, type changed)
- Authentication mechanism replaced
- Docker volume/mount paths changed (breaks existing deployments)
- Any change that requires manual migration on upgrade

```
1.0.0 → 2.0.0
```

### MINOR — New Features

Increment MINOR when:

- New page or route added
- New document field added (backward-compatible DB migration)
- New category, filter, or UI feature
- New environment variable or configuration option

```
1.0.0 → 1.1.0
```

### PATCH — Fixes & Small Updates

Increment PATCH when:

- Bug fixes
- UI/CSS tweaks
- Security patches
- Dependency version bumps
- Documentation updates

```
1.1.0 → 1.1.1
```

---

## 3. Files to Update on Every Release

| File | What to update |
|---|---|
| `VERSION` | New version number (single line) |
| `CHANGELOG.md` | New entry at the top |
| Git tag | `git tag v<version> && git push origin v<version>` |

---

## 4. Changelog Format

Follow this structure in `CHANGELOG.md`:

```markdown
## [1.1.0] - YYYY-MM-DD

### Added
- New features or pages

### Changed
- Updates to existing behaviour

### Fixed
- Bug fixes

### Security
- Security-related fixes

### Breaking Changes
- Anything requiring manual action on upgrade
```

---

## 5. Docker Image Tagging

Every release should tag the Docker image with both the version and `latest`:

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -t pmananthu/docvault:1.1.0 \
  -t pmananthu/docvault:latest \
  --push .
```

---

## 6. Release Process

1. Implement and test the change
2. Identify change type: MAJOR / MINOR / PATCH
3. Update `VERSION` with the new version number
4. Add entry to `CHANGELOG.md`
5. Commit: `git commit -m "chore(release): bump version to x.y.z"`
6. Tag: `git tag vx.y.z && git push origin vx.y.z`
7. Build and push Docker image with new tag

---

## 7. Notes

- Never skip a `CHANGELOG.md` entry, even for patch releases
- Breaking changes must include migration instructions in the changelog
- The `SECRET_KEY` env var change between deployments invalidates all sessions (document in changelog if changed)
