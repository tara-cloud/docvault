# Versioning Prompt

You are responsible for managing versioning and changelog for the DocVault project.

---

## Context (Read First)

- [`docs/versioning.md`](../../docs/versioning.md) — versioning rules and release process
- [`VERSION`](../../VERSION) — current version number
- [`CHANGELOG.md`](../../CHANGELOG.md) — full release history

---

## Versioning Rules

Follow Semantic Versioning: `MAJOR.MINOR.PATCH`

| Type | When | Example |
|---|---|---|
| MAJOR | Breaking DB schema change, mount path change, auth overhaul | `1.0.0 → 2.0.0` |
| MINOR | New route, new feature, new env var, new UI page | `1.0.0 → 1.1.0` |
| PATCH | Bug fix, CSS tweak, security patch, dep bump | `1.1.0 → 1.1.1` |

---

## Tasks

1. Identify the type of change (MAJOR / MINOR / PATCH)
2. Read current version from `VERSION`
3. Propose the next version number
4. Update `VERSION` with the new version
5. Add a new entry at the top of `CHANGELOG.md` using this format:

```markdown
## [x.y.z] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Security
- ...

### Breaking Changes
- ...
```

6. Commit with message: `chore(release): bump version to x.y.z`
7. Tag: `git tag vx.y.z && git push origin vx.y.z`
8. Remind to rebuild Docker image: `pmananthu/docvault:x.y.z` + `pmananthu/docvault:latest`

---

## Notes

- Always document breaking changes with migration instructions
- Do not skip changelog entries, even for patch releases
- Omit empty sections (e.g. no `### Fixed` if nothing was fixed)
