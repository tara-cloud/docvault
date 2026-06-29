# DocVault — Claude Code Project

Personal document vault for CasaOS on Raspberry Pi. Flask + SQLite backend, Bootstrap 5 dark UI, multi-arch Docker image.

## Dev Commands

```bash
# Install deps
pip install -r requirements.txt

# Run locally
UPLOAD_DIR=./uploads DB_PATH=./docvault.db APP_PASSWORD=test python app.py
# → http://localhost:9091

# Build Docker image
docker build -t docvault .
docker run -p 9091:9091 -e APP_PASSWORD=test -v $(pwd)/data:/data docvault

# Build + push multi-arch (amd64 + arm64)
docker buildx build --platform linux/amd64,linux/arm64 \
  -t pmananthu/docvault:latest --push .

# Deploy to Pi (see /deploy skill)
```

## Pi Deployment (k3s)

- **Host:** `pi@192.168.0.107`
- **Namespace:** `docvault`
- **Data dir:** `/DATA/AppData/docvault/` (host-path mount)
- **NodePort:** `30091` → `http://192.168.0.107:30091`
- **Docker Hub image:** `pmananthu/docvault:latest`
- **Helm chart:** `./helm/docvault/`

```bash
# First deploy
helm upgrade --install docvault ./helm/docvault \
  --namespace docvault --create-namespace \
  --set env.appPassword=<password> \
  --set env.secretKey=<long-random-string>

# Check status
kubectl get pods -n docvault
kubectl logs -n docvault deployment/docvault

# Manual redeploy after image push
kubectl rollout restart deployment/docvault -n docvault
```

## Project Structure

```text
app.py                  # All Flask routes, DB helpers, auth — single file
requirements.txt        # Flask==3.0.3, Werkzeug==3.0.3
Dockerfile              # python:3.11-slim, port 9091, healthcheck
docker-compose.yml      # CasaOS x-casaos format
templates/              # Jinja2 templates (base, login, dashboard, upload, preview, edit, categories)
static/                 # icon.png, favicon.svg, manifest.json, style.css
docs/versioning.md      # Semver strategy and release process
CHANGELOG.md            # Release history
VERSION                 # Current version (single line)
.github/prompts/        # AI prompts for versioning
.claude/agents/         # Sub-agents for deploy and release
.claude/commands/       # Slash commands: /deploy, /release
```

## Code Conventions

- **Single file backend:** all routes live in `app.py` — do not split into blueprints
- **DB access:** always use `get_db()` helper; `conn.row_factory = sqlite3.Row`
- **Auth:** `@login_required` decorator on every route except `/login` and `/health`
- **CSRF:** validate `_validate_csrf(request.form.get("csrf_token"))` on every POST
- **File paths:** built from `doc["uuid"] + doc["file_ext"]` only — never from URL params
- **Tags:** stored as `,tag1,tag2,` (padded commas) in DB; `_normalize_tags()` on write
- **Templates:** all extend `base.html`; Bootstrap 5 dark theme (`data-bs-theme="dark"`)

## Versioning

- Version tracked in `VERSION` file
- Follow semver: MAJOR (breaking DB/mount change) · MINOR (new feature) · PATCH (fix)
- Update `VERSION` + `CHANGELOG.md` on every release, then `git tag vX.Y.Z`
- Use `/release` skill to automate the process

## Environment Variables

| Var | Default | Notes |
| --- | ------- | ----- |
| `APP_PASSWORD` | `changeme` | Login password |
| `SECRET_KEY` | random | Set a fixed value so sessions survive restarts |
| `DB_PATH` | `/data/docvault.db` | SQLite path inside container |
| `UPLOAD_DIR` | `/data/uploads` | File storage inside container |
