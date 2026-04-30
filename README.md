# DocVault

A personal document vault for [CasaOS](https://casaos.io) — upload, preview, and manage your important documents from your home cloud.

![Python](https://img.shields.io/badge/Python-3.11-blue)
![Flask](https://img.shields.io/badge/Flask-3.0.3-lightgrey)
![Docker](https://img.shields.io/badge/Docker-multi--arch-blue)
![Version](https://img.shields.io/badge/version-1.0.0-green)
![Platform](https://img.shields.io/badge/platform-CasaOS%20%7C%20Raspberry%20Pi-orange)

---

## Features

- **Upload & Download** — PDF, PNG, JPG, GIF, WEBP, DOCX (up to 50 MB)
- **In-browser Preview** — PDF embed and image viewer, no download needed
- **Categories** — 7 built-in (ID, Insurance, Medical, Finance, Education, Travel, Other) + custom
- **Tags** — chip-style multi-tag input, filterable from dashboard
- **Expiry Reminders** — red badge (≤30 days), yellow (≤90 days), dark (expired)
- **Search** — by name, description, tags, category, or expiry status
- **Password Protected** — single-user session-based login
- **PWA Ready** — installable as a home screen app on mobile

---

## Screenshots

| Dashboard | Upload | Preview |
|-----------|--------|---------|
| Document grid with expiry badges | Tag chip input + category selector | Side-by-side PDF/image viewer |

---

## Quick Start (CasaOS)

### Option 1 — CasaOS Custom Install (Recommended)

1. Open **CasaOS** → **App Store** → **Custom Install**
2. Paste the contents of [`docker-compose.yml`](docker-compose.yml)
3. Change `APP_PASSWORD` and `SECRET_KEY` before installing
4. Click **Install**

### Option 2 — SSH / Terminal

```bash
# On your Raspberry Pi
mkdir -p /var/lib/casaos/apps/docvault
curl -o /var/lib/casaos/apps/docvault/docker-compose.yml \
  https://raw.githubusercontent.com/tara-cloud/docvault/main/docker-compose.yml

# Edit credentials first
nano /var/lib/casaos/apps/docvault/docker-compose.yml

# Start
cd /var/lib/casaos/apps/docvault
docker compose up -d
```

App will be available at `http://<pi-ip>:9091`

---

## Configuration

All configuration is via environment variables in `docker-compose.yml`:

| Variable | Default | Description |
|---|---|---|
| `APP_PASSWORD` | `changeme` | Login password — **change this** |
| `SECRET_KEY` | random | Flask session secret — set a long random string for persistence across restarts |
| `DB_PATH` | `/data/docvault.db` | SQLite database path |
| `UPLOAD_DIR` | `/data/uploads` | File storage directory |

Data is persisted at `/DATA/AppData/docvault/` on the host.

---

## Building Locally

```bash
# Clone
git clone https://github.com/tara-cloud/docvault.git
cd docvault

# Run locally (dev)
pip install -r requirements.txt
UPLOAD_DIR=./uploads DB_PATH=./docvault.db APP_PASSWORD=test python app.py

# Build Docker image
docker build -t docvault .

# Build multi-arch and push
docker buildx build --platform linux/amd64,linux/arm64 \
  -t your-dockerhub/docvault:latest --push .
```

---

## Project Structure

```
docvault/
├── app.py                  # Flask app — all routes, DB, auth, file handling
├── requirements.txt        # Flask + Werkzeug only
├── Dockerfile              # python:3.11-slim, port 9091, healthcheck
├── docker-compose.yml      # CasaOS x-casaos format, bind mount /DATA/AppData/docvault
├── templates/
│   ├── base.html           # Bootstrap 5 dark theme layout + nav
│   ├── login.html          # Password login form
│   ├── dashboard.html      # Document grid + search/filter
│   ├── upload.html         # Upload form with tag chip input
│   ├── preview.html        # In-browser preview + metadata sidebar
│   ├── edit.html           # Edit document metadata
│   └── categories.html     # Category management
└── static/
    ├── icon.png            # 192×192 app icon (CasaOS + PWA)
    ├── favicon.svg         # SVG favicon
    ├── manifest.json       # PWA manifest
    └── style.css           # Custom CSS overrides
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.11 + Flask 3.0 |
| Database | SQLite (via stdlib `sqlite3`) |
| Auth | Werkzeug password hashing + Flask sessions |
| Frontend | Bootstrap 5.3 (CDN) + Bootstrap Icons + Vanilla JS |
| Container | Docker (multi-arch: `linux/amd64`, `linux/arm64`) |
| Platform | CasaOS 0.4+ on Raspberry Pi |

---

## Security

- Passwords hashed with `werkzeug.security.generate_password_hash` at startup
- File paths built from DB-stored UUIDs only — no path traversal possible
- CSRF tokens on all POST forms
- File type validated against an extension whitelist
- `SESSION_COOKIE_HTTPONLY=True`, `SAMESITE=Lax`
- `MAX_CONTENT_LENGTH` enforced at Flask level (50 MB)

---

## Versioning

This project follows [Semantic Versioning](https://semver.org). See [docs/versioning.md](docs/versioning.md) for the full strategy and [CHANGELOG.md](CHANGELOG.md) for release history.

---

## License

MIT
