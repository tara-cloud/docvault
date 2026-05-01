# Changelog

All notable changes to DocVault are documented here.

This project follows [Semantic Versioning](https://semver.org) — see [docs/versioning.md](docs/versioning.md) for the full strategy.

---

## [1.1.0] - 2026-04-30

### Added

- Settings page (`/settings`) with password change and theme switching
- Light/dark mode toggle — preference stored in DB, persists across restarts
- `settings` table in SQLite for persistent configuration
- Settings nav link added to top navigation bar

### Changed

- Redesigned Edit page with file info notice and consistent card style
- Redesigned Categories page — icon preview in input group, cleaner table rows with icon badges
- Preview page tag pills and delete button use solid backgrounds for WCAG contrast compliance
- All pages now follow a unified card header style (`small fw-semibold` muted label)

---

## [1.0.0] - 2026-05-01

### Added

- Initial release of DocVault
- Single-user password-protected login (`APP_PASSWORD` env var)
- Document upload: PDF, PNG, JPG, GIF, WEBP, DOCX (up to 50 MB)
- In-browser preview: PDF embed and image viewer
- 7 built-in categories: ID, Insurance, Medical, Finance, Education, Travel, Other
- Custom category management with Bootstrap Icons support
- Tag chip input — add/remove individual tags on upload and edit
- Expiry date tracking with visual badges (red ≤30d, yellow ≤90d, dark = expired)
- Dashboard search: by name, description, tags, category, expiry status
- Stat cards: total documents, expiring soon, expired counts
- Edit document metadata (name, description, category, tags, expiry)
- Download with original filename preserved
- Delete with confirmation
- CasaOS integration: `x-casaos` compose format, app icon, Productivity category
- Multi-arch Docker image: `linux/amd64` + `linux/arm64` (Raspberry Pi)
- Data persisted at `/DATA/AppData/docvault/` via bind mount
- PWA manifest for mobile home screen install
- Bootstrap 5.3 dark theme UI with card hover animations
- Docker healthcheck on `/health` endpoint
- CSRF protection on all POST forms
- Path traversal prevention — file paths built from DB UUIDs only
