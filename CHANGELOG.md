# Changelog

All notable changes to DocVault are documented here.

This project follows [Semantic Versioning](https://semver.org) — see [docs/versioning.md](docs/versioning.md) for the full strategy.

---

## [1.4.0] - 2026-06-29

### Added

- **Helm chart** (`helm/docvault/`) for k3s deployment — namespace, deployment, NodePort service (30091), PVC, liveness/readiness probes
- GitHub Actions `ci.yml` — Python syntax check + flake8 lint on every PR and non-main push
- GitHub Actions `release.yml` — auto GitHub Release from `VERSION` + `CHANGELOG`, multi-arch Docker build (`amd64` + `arm64`), Helm upgrade on Pi via self-hosted runner

### Changed

- Deployment migrated from CasaOS docker-compose to k3s via Helm; app now accessible at `http://<pi>:30091`
- Dashboard stat cards (Expiring Soon, Expired) are clickable filter links
- Grid/list view toggle on dashboard with `localStorage` persistence
- Quick-preview modal for PDFs and images (inline, no page navigation)
- Keyboard shortcut `/` to focus search with floating hint
- Upload page 3-step progress indicator and live XHR progress bar
- Navbar active-link underline indicator
- Accessibility: proper labels, `aria-live` spinners, `<output>` for status

### Fixed

- Removed unused `PdfReadError` import from `app.py`
- Fixed unused `except Exception as e` variable in PDF decrypt route

---

## [1.3.0] - 2026-06-13

### Added

- **Folders** — create unlimited nested folders to organise documents; folders can contain subfolders (any depth)
- Folder breadcrumb navigation on the dashboard — click any level to jump back
- Folder cards grid on the dashboard showing subfolder names and document counts
- New Folder button (modal) on every folder view; Rename and Delete actions on the current folder
- Delete folder is blocked if it contains any documents (prevents accidental data loss)
- Folder selector dropdown on Upload and Edit forms — place or move a document into any folder
- Global search/filter ignores folder scope so you can find any document across the whole vault
- **Password-protected PDF preview** — encrypted PDFs show a lock overlay; enter the document password to decrypt in-memory and view without downloading
- `pypdf` dependency added for PDF encryption detection and in-memory decryption (no temp files written)
- Safe DB migration adds `folders` table and `folder_id` column to existing `documents` rows on first run

---

## [1.2.1] - 2026-05-08

### Changed

- Expiry date field on upload and edit forms is now controlled by a "Has expiry" checkbox
- When unchecked, the date input is hidden **and** disabled (not submitted) — guaranteed to store NULL
- NULL expiry docs are excluded from all expiry calculations (expiring-soon count, expired count, expiry filter)

---

## [1.2.0] - 2026-05-08

### Added

- Document versioning — upload a new file when editing a document; the old file is archived as a previous version
- Version history panel in the preview sidebar showing version number, date, file type, size, and optional note
- Download any previous version directly from the preview page
- Restore any previous version to become the current document (current file is auto-archived)
- `document_versions` table in SQLite; safe migration adds `version_num` column to existing `documents` rows
- Version note field on edit page — optional description of what changed (e.g. "2025 renewal")

### Changed

- `doc_delete` now cleans up all version files from disk before removing the document
- Edit page shows current file info with version badge and previous-version count hint
- File replacement logic extracted to `_replace_doc_file()` helper for clarity

---

## [1.1.0] - 2026-04-30

### Added

- Settings page (`/settings`) with password change and theme switching
- Light/dark mode toggle — preference stored in DB, persists across restarts
- `settings` table in SQLite for persistent configuration
- Settings nav link added to top navigation bar

### Changed

- Redesigned Edit page with file info notice and consistent card header style
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
