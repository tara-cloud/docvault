import io
import os
import uuid
import sqlite3
import functools
import tarfile
import secrets
import threading
import time
from datetime import datetime, date, timedelta
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, send_file, flash, abort, jsonify, Response
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

try:
    from pypdf import PdfReader
    _PYPDF_AVAILABLE = True
except ImportError:
    _PYPDF_AVAILABLE = False

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_PASSWORD  = os.environ.get("APP_PASSWORD", "changeme")
SECRET_KEY    = os.environ.get("SECRET_KEY", secrets.token_hex(32))
DB_PATH       = os.environ.get("DB_PATH", "/data/docvault.db")
UPLOAD_DIR    = os.environ.get("UPLOAD_DIR", "/data/uploads")
BACKUP_DIR    = os.environ.get("BACKUP_DIR", "/backup/docvault")
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

HASHED_PASSWORD = generate_password_hash(APP_PASSWORD)  # may be overridden from DB after init

ALLOWED_EXTENSIONS = {
    ".pdf":  "application/pdf",
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}

DEFAULT_CATEGORIES = [
    ("ID",        "id",        "person-badge"),
    ("Insurance", "insurance", "shield-check"),
    ("Medical",   "medical",   "heart-pulse"),
    ("Finance",   "finance",   "cash-coin"),
    ("Education", "education", "mortarboard"),
    ("Travel",    "travel",    "airplane"),
    ("Other",     "other",     "archive"),
]

app = Flask(__name__)
app.config.update(
    SECRET_KEY=SECRET_KEY,
    MAX_CONTENT_LENGTH=MAX_FILE_SIZE,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=7),
)

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS categories (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL UNIQUE,
                slug       TEXT    NOT NULL UNIQUE,
                icon       TEXT    NOT NULL DEFAULT 'folder',
                is_default INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS folders (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                parent_id  INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                created_at TEXT    NOT NULL,
                UNIQUE(name, parent_id)
            );

            CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

            CREATE TABLE IF NOT EXISTS documents (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid          TEXT    NOT NULL UNIQUE,
                original_name TEXT    NOT NULL,
                display_name  TEXT    NOT NULL,
                description   TEXT,
                category_id   INTEGER NOT NULL DEFAULT 7,
                folder_id     INTEGER REFERENCES folders(id) ON DELETE SET NULL,
                tags          TEXT,
                file_ext      TEXT    NOT NULL,
                file_size     INTEGER NOT NULL,
                mime_type     TEXT    NOT NULL,
                expiry_date   TEXT,
                uploaded_at   TEXT    NOT NULL,
                FOREIGN KEY (category_id) REFERENCES categories(id)
            );

            CREATE INDEX IF NOT EXISTS idx_docs_category ON documents(category_id);

            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS document_versions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                document_id   INTEGER NOT NULL,
                version_num   INTEGER NOT NULL,
                uuid          TEXT    NOT NULL UNIQUE,
                original_name TEXT    NOT NULL,
                file_ext      TEXT    NOT NULL,
                file_size     INTEGER NOT NULL,
                mime_type     TEXT    NOT NULL,
                version_note  TEXT,
                replaced_at   TEXT    NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents(id)
            );

            CREATE INDEX IF NOT EXISTS idx_versions_doc ON document_versions(document_id);
        """)
        # Migrations: safe for existing DBs
        for col_sql in [
            "ALTER TABLE documents ADD COLUMN version_num INTEGER NOT NULL DEFAULT 1",
            "ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES folders(id) ON DELETE SET NULL",
        ]:
            try:
                conn.execute(col_sql)
            except sqlite3.OperationalError:
                pass
        # Create folder index only after column is guaranteed to exist
        conn.execute("CREATE INDEX IF NOT EXISTS idx_docs_folder ON documents(folder_id)")


def seed_categories():
    with get_db() as conn:
        existing = conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0]
        if existing == 0:
            conn.executemany(
                "INSERT INTO categories (name, slug, icon, is_default) VALUES (?, ?, ?, 1)",
                DEFAULT_CATEGORIES,
            )


def seed_settings():
    with get_db() as conn:
        conn.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'dark')")

# ---------------------------------------------------------------------------
# Settings helpers
# ---------------------------------------------------------------------------
def _get_setting(key, default=None):
    with get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
    return row[0] if row else default


def _set_setting(key, value):
    with get_db() as conn:
        conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))


def _reload_password_hash():
    global HASHED_PASSWORD
    saved = _get_setting("password_hash")
    if saved:
        HASHED_PASSWORD = saved


@app.context_processor
def inject_theme():
    try:
        return {"app_theme": _get_setting("theme", "dark")}
    except Exception:
        return {"app_theme": "dark"}


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------
def login_required(f):
    @functools.wraps(f)
    def decorated(*args, **kwargs):
        if not session.get("authenticated"):
            return redirect(url_for("login_get"))
        return f(*args, **kwargs)
    return decorated


def _generate_csrf():
    if "csrf_token" not in session:
        session["csrf_token"] = secrets.token_hex(32)
    return session["csrf_token"]


def _validate_csrf(token):
    return token and token == session.get("csrf_token")


app.jinja_env.globals["csrf_token"] = _generate_csrf

# ---------------------------------------------------------------------------
# Folder helpers
# ---------------------------------------------------------------------------
def _get_folder_or_404(folder_id):
    with get_db() as conn:
        folder = conn.execute("SELECT * FROM folders WHERE id=?", (folder_id,)).fetchone()
    if folder is None:
        abort(404)
    return folder


def _get_folder_path(folder_id):
    """Return ordered list of (id, name) from root to the given folder."""
    breadcrumb = []
    with get_db() as conn:
        fid = folder_id
        while fid:
            row = conn.execute("SELECT id, name, parent_id FROM folders WHERE id=?", (fid,)).fetchone()
            if row is None:
                break
            breadcrumb.append({"id": row["id"], "name": row["name"]})
            fid = row["parent_id"]
    breadcrumb.reverse()
    return breadcrumb


def _get_subfolders(parent_id):
    with get_db() as conn:
        if parent_id is None:
            rows = conn.execute(
                "SELECT f.*, COUNT(d.id) AS doc_count FROM folders f "
                "LEFT JOIN documents d ON d.folder_id = f.id "
                "WHERE f.parent_id IS NULL GROUP BY f.id ORDER BY f.name"
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT f.*, COUNT(d.id) AS doc_count FROM folders f "
                "LEFT JOIN documents d ON d.folder_id = f.id "
                "WHERE f.parent_id=? GROUP BY f.id ORDER BY f.name",
                (parent_id,)
            ).fetchall()
    return [dict(r) for r in rows]


def _count_folder_docs_recursive(folder_id):
    """Count all documents in folder and all descendant folders."""
    with get_db() as conn:
        total = 0
        stack = [folder_id]
        while stack:
            fid = stack.pop()
            cnt = conn.execute("SELECT COUNT(*) FROM documents WHERE folder_id=?", (fid,)).fetchone()[0]
            total += cnt
            children = conn.execute("SELECT id FROM folders WHERE parent_id=?", (fid,)).fetchall()
            stack.extend(r["id"] for r in children)
    return total


def _folder_tree(parent_id=None, indent=0):
    """Flat list of {id, name, depth} for folder selector dropdowns."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, name, parent_id FROM folders WHERE parent_id IS ? ORDER BY name",
            (parent_id,)
        ).fetchall()
    result = []
    for r in rows:
        result.append({"id": r["id"], "name": r["name"], "depth": indent})
        result.extend(_folder_tree(r["id"], indent + 1))
    return result

# ---------------------------------------------------------------------------
# Document helpers
# ---------------------------------------------------------------------------
def _get_doc_or_404(doc_id):
    with get_db() as conn:
        doc = conn.execute(
            """SELECT d.*, c.name AS category_name, c.icon AS category_icon
               FROM documents d JOIN categories c ON d.category_id = c.id
               WHERE d.id = ?""",
            (doc_id,),
        ).fetchone()
    if doc is None:
        abort(404)
    return doc


def _get_doc_path(doc):
    return os.path.join(UPLOAD_DIR, doc["uuid"] + doc["file_ext"])


def _compute_expiry(expiry_str):
    if not expiry_str:
        return None, None
    try:
        exp = date.fromisoformat(expiry_str)
        days = (exp - date.today()).days
        if days < 0:
            return "expired", days
        if days <= 30:
            return "expiring-soon", days
        if days <= 90:
            return "expiry-warning", days
        return None, days
    except ValueError:
        return None, None


def _enrich_doc(doc):
    d = dict(doc)
    status, days = _compute_expiry(d.get("expiry_date"))
    d["expiry_status"] = status
    d["days_until_expiry"] = days
    d["tags_list"] = [t.strip() for t in (d.get("tags") or "").strip(",").split(",") if t.strip()]
    d["file_size_human"] = _human_size(d["file_size"])
    d["version_num"] = d.get("version_num") or 1
    return d


def _human_size(size):
    for unit in ("B", "KB", "MB"):
        if size < 1024:
            return f"{size:.0f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def _get_doc_versions(doc_id):
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM document_versions WHERE document_id=? ORDER BY version_num DESC",
            (doc_id,)
        ).fetchall()
    return [{**dict(v), "file_size_human": _human_size(v["file_size"])} for v in rows]


def _search_documents(q=None, category_id=None, tag=None, expiry_filter=None, folder_id=None):
    conditions, params = [], []

    # Folder filtering: None means root (no folder), int means specific folder
    if folder_id == "root":
        conditions.append("d.folder_id IS NULL")
    elif folder_id is not None:
        conditions.append("d.folder_id = ?")
        params.append(folder_id)

    if q:
        like = f"%{q}%"
        conditions.append("(d.display_name LIKE ? OR d.description LIKE ? OR d.tags LIKE ?)")
        params.extend([like, like, like])

    if category_id:
        conditions.append("d.category_id = ?")
        params.append(category_id)

    if tag:
        conditions.append("d.tags LIKE ?")
        params.append(f"%,{tag},%")

    if expiry_filter == "expiring":
        cutoff = (date.today() + timedelta(days=90)).isoformat()
        today  = date.today().isoformat()
        conditions.append("d.expiry_date IS NOT NULL AND d.expiry_date >= ? AND d.expiry_date <= ?")
        params.extend([today, cutoff])
    elif expiry_filter == "expired":
        today = date.today().isoformat()
        conditions.append("d.expiry_date IS NOT NULL AND d.expiry_date < ?")
        params.append(today)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    sql = f"""
        SELECT d.*, c.name AS category_name, c.icon AS category_icon
        FROM documents d JOIN categories c ON d.category_id = c.id
        {where}
        ORDER BY d.uploaded_at DESC
    """
    with get_db() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [_enrich_doc(r) for r in rows]


def _is_pdf_encrypted(path):
    """Return True if the PDF file is encrypted/password-protected."""
    if not _PYPDF_AVAILABLE:
        return False
    try:
        reader = PdfReader(path)
        return reader.is_encrypted
    except Exception:
        return False

# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------
@app.route("/health")
def health():
    return jsonify({"status": "ok"})


@app.route("/login", methods=["GET"])
def login_get():
    if session.get("authenticated"):
        return redirect(url_for("dashboard"))
    return render_template("login.html")


@app.route("/login", methods=["POST"])
def login_post():
    if not _validate_csrf(request.form.get("csrf_token")):
        flash("Invalid request.", "danger")
        return render_template("login.html"), 400
    if check_password_hash(HASHED_PASSWORD, request.form.get("password", "")):
        session.permanent = True
        session["authenticated"] = True
        return redirect(url_for("dashboard"))
    flash("Incorrect password. Please try again.", "danger")
    return render_template("login.html"), 401


@app.route("/logout", methods=["POST"])
@login_required
def logout():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    session.clear()
    return redirect(url_for("login_get"))

# ---------------------------------------------------------------------------
# Dashboard
# ---------------------------------------------------------------------------
@app.route("/")
@login_required
def dashboard():
    q              = request.args.get("q", "").strip()
    category_id    = request.args.get("category_id", type=int)
    tag            = request.args.get("tag", "").strip()
    expiry_filter  = request.args.get("expiry_filter", "")
    folder_id      = request.args.get("folder_id", type=int)

    # When searching/filtering across the vault, ignore folder scope
    searching = bool(q or category_id or tag or expiry_filter)

    if searching:
        docs = _search_documents(
            q=q or None,
            category_id=category_id,
            tag=tag or None,
            expiry_filter=expiry_filter or None,
        )
        subfolders = []
        breadcrumb = []
        current_folder = None
    else:
        docs = _search_documents(
            folder_id=folder_id if folder_id else "root",
        )
        subfolders = _get_subfolders(folder_id)
        breadcrumb = _get_folder_path(folder_id) if folder_id else []
        current_folder = dict(_get_folder_or_404(folder_id)) if folder_id else None

    with get_db() as conn:
        categories = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
        total      = conn.execute("SELECT COUNT(*) FROM documents").fetchone()[0]

    today  = date.today().isoformat()
    cutoff = (date.today() + timedelta(days=30)).isoformat()
    with get_db() as conn:
        expiring_count = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE expiry_date IS NOT NULL AND expiry_date >= ? AND expiry_date <= ?",
            (today, cutoff),
        ).fetchone()[0]
        expired_count = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE expiry_date IS NOT NULL AND expiry_date < ?",
            (today,),
        ).fetchone()[0]

    folder_tree = _folder_tree()

    return render_template(
        "dashboard.html",
        docs=docs,
        subfolders=subfolders,
        breadcrumb=breadcrumb,
        current_folder=current_folder,
        folder_tree=folder_tree,
        categories=categories,
        total=total,
        expiring_count=expiring_count,
        expired_count=expired_count,
        q=q,
        selected_category_id=category_id,
        selected_tag=tag,
        expiry_filter=expiry_filter,
        folder_id=folder_id,
        searching=searching,
    )

@app.route("/doc/<int:doc_id>/move", methods=["POST"])
@login_required
def doc_move(doc_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    _get_doc_or_404(doc_id)
    # folder_id="" means move to root
    raw = request.form.get("folder_id", "").strip()
    folder_id = int(raw) if raw else None
    with get_db() as conn:
        conn.execute("UPDATE documents SET folder_id=? WHERE id=?", (folder_id, doc_id))
    return jsonify({"ok": True})


# ---------------------------------------------------------------------------
# Folder CRUD
# ---------------------------------------------------------------------------
@app.route("/folders/create", methods=["POST"])
@login_required
def folder_create():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    name = request.form.get("name", "").strip()
    parent_id = request.form.get("parent_id", type=int)  # None = root

    if not name:
        flash("Folder name is required.", "danger")
        return redirect(url_for("dashboard", folder_id=parent_id))

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO folders (name, parent_id, created_at) VALUES (?, ?, ?)",
                (name, parent_id, now),
            )
        flash(f'Folder "{name}" created.', "success")
    except sqlite3.IntegrityError:
        flash(f'A folder named "{name}" already exists here.', "danger")

    return redirect(url_for("dashboard", folder_id=parent_id))


@app.route("/folders/<int:folder_id>/rename", methods=["POST"])
@login_required
def folder_rename(folder_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    folder = _get_folder_or_404(folder_id)
    name = request.form.get("name", "").strip()
    if not name:
        flash("Folder name is required.", "danger")
        return redirect(url_for("dashboard", folder_id=folder["parent_id"]))
    try:
        with get_db() as conn:
            conn.execute("UPDATE folders SET name=? WHERE id=?", (name, folder_id))
        flash(f'Folder renamed to "{name}".', "success")
    except sqlite3.IntegrityError:
        flash(f'A folder named "{name}" already exists here.', "danger")
    return redirect(url_for("dashboard", folder_id=folder_id))


@app.route("/folders/<int:folder_id>/delete", methods=["POST"])
@login_required
def folder_delete(folder_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    folder = _get_folder_or_404(folder_id)
    parent_id = folder["parent_id"]

    doc_count = _count_folder_docs_recursive(folder_id)
    if doc_count > 0:
        flash(f"Cannot delete: folder contains {doc_count} document(s). Move or delete them first.", "danger")
        return redirect(url_for("dashboard", folder_id=folder_id))

    with get_db() as conn:
        conn.execute("DELETE FROM folders WHERE id=?", (folder_id,))

    flash("Folder deleted.", "success")
    return redirect(url_for("dashboard", folder_id=parent_id))

# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------
@app.route("/upload", methods=["GET"])
@login_required
def upload_get():
    with get_db() as conn:
        categories = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    folder_id = request.args.get("folder_id", type=int)
    folder_tree = _folder_tree()
    return render_template("upload.html", categories=categories, folder_id=folder_id, folder_tree=folder_tree)


@app.route("/upload", methods=["POST"])
@login_required
def upload_post():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)

    f = request.files.get("file")
    if not f or not f.filename:
        flash("No file selected.", "danger")
        return redirect(url_for("upload_get"))

    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        flash(f"File type '{ext}' is not allowed.", "danger")
        return redirect(url_for("upload_get"))

    display_name = request.form.get("display_name", "").strip()
    if not display_name:
        display_name = os.path.splitext(f.filename)[0]

    original_name = secure_filename(f.filename)
    file_uuid     = str(uuid.uuid4())
    save_path     = os.path.join(UPLOAD_DIR, file_uuid + ext)
    f.save(save_path)
    file_size = os.path.getsize(save_path)

    raw_tags  = request.form.get("tags", "").strip()
    tags_norm = _normalize_tags(raw_tags)

    expiry_date = request.form.get("expiry_date", "").strip() or None
    category_id = request.form.get("category_id", 7, type=int)
    description = request.form.get("description", "").strip() or None
    folder_id   = request.form.get("folder_id", type=int)  # None = root

    with get_db() as conn:
        conn.execute(
            """INSERT INTO documents
               (uuid, original_name, display_name, description, category_id, folder_id, tags,
                file_ext, file_size, mime_type, expiry_date, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                file_uuid, original_name, display_name, description, category_id,
                folder_id, tags_norm, ext, file_size, ALLOWED_EXTENSIONS[ext],
                expiry_date, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )

    flash(f'"{display_name}" uploaded successfully.', "success")
    return redirect(url_for("dashboard", folder_id=folder_id))


def _normalize_tags(raw):
    if not raw:
        return None
    tags = [t.strip().lower() for t in raw.split(",") if t.strip()]
    return ("," + ",".join(tags) + ",") if tags else None

# ---------------------------------------------------------------------------
# Document detail / preview
# ---------------------------------------------------------------------------
@app.route("/doc/<int:doc_id>")
@login_required
def doc_detail(doc_id):
    doc = _enrich_doc(_get_doc_or_404(doc_id))
    versions = _get_doc_versions(doc_id)
    path = _get_doc_path(doc)
    is_encrypted = False
    if doc["mime_type"] == "application/pdf" and os.path.exists(path):
        is_encrypted = _is_pdf_encrypted(path)
    return render_template("preview.html", doc=doc, versions=versions, is_encrypted=is_encrypted)


@app.route("/doc/<int:doc_id>/preview-file")
@login_required
def doc_preview_file(doc_id):
    doc  = _get_doc_or_404(doc_id)
    path = _get_doc_path(doc)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, mimetype=doc["mime_type"])


@app.route("/doc/<int:doc_id>/preview-file-unlocked", methods=["POST"])
@login_required
def doc_preview_file_unlocked(doc_id):
    """Decrypt a password-protected PDF in memory and stream it unlocked."""
    doc  = _get_doc_or_404(doc_id)
    if doc["mime_type"] != "application/pdf":
        abort(400)
    path = _get_doc_path(doc)
    if not os.path.exists(path):
        abort(404)
    if not _PYPDF_AVAILABLE:
        abort(501)

    pdf_password = request.form.get("pdf_password", "")
    try:
        reader = PdfReader(path)
        if reader.is_encrypted:
            result = reader.decrypt(pdf_password)
            if result == 0:
                return jsonify({"error": "Incorrect password."}), 401
        from pypdf import PdfWriter
        writer = PdfWriter()
        for page in reader.pages:
            writer.add_page(page)
        buf = io.BytesIO()
        writer.write(buf)
        buf.seek(0)
        return Response(buf.read(), mimetype="application/pdf")
    except Exception:
        return jsonify({"error": "Could not decrypt PDF."}), 400


@app.route("/doc/<int:doc_id>/download")
@login_required
def doc_download(doc_id):
    doc  = _get_doc_or_404(doc_id)
    path = _get_doc_path(doc)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=doc["original_name"])

# ---------------------------------------------------------------------------
# Edit / Delete
# ---------------------------------------------------------------------------
@app.route("/doc/<int:doc_id>/edit", methods=["GET"])
@login_required
def doc_edit_get(doc_id):
    doc = _enrich_doc(_get_doc_or_404(doc_id))
    with get_db() as conn:
        categories = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    versions = _get_doc_versions(doc_id)
    folder_tree = _folder_tree()
    return render_template("edit.html", doc=doc, categories=categories, versions=versions, folder_tree=folder_tree)


def _replace_doc_file(doc_id, new_file, version_note, display_name, description, category_id, tags_norm, expiry_date, folder_id):
    ext = os.path.splitext(new_file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        return f"File type '{ext}' is not allowed.", None
    new_uuid  = str(uuid.uuid4())
    save_path = os.path.join(UPLOAD_DIR, new_uuid + ext)
    try:
        new_file.save(save_path)
        new_size     = os.path.getsize(save_path)
        new_mime     = ALLOWED_EXTENSIONS[ext]
        new_original = secure_filename(new_file.filename)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with get_db() as conn:
            cur = conn.execute(
                "SELECT uuid, file_ext, file_size, mime_type, original_name, version_num FROM documents WHERE id=?",
                (doc_id,)
            ).fetchone()
            conn.execute(
                """INSERT INTO document_versions
                   (document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, replaced_at)
                   VALUES (?,?,?,?,?,?,?,?,?)""",
                (doc_id, cur["version_num"], cur["uuid"], cur["original_name"],
                 cur["file_ext"], cur["file_size"], cur["mime_type"], version_note, now)
            )
            conn.execute(
                """UPDATE documents SET uuid=?, original_name=?, file_ext=?, file_size=?,
                   mime_type=?, version_num=version_num+1, uploaded_at=?,
                   display_name=?, description=?, category_id=?, tags=?, expiry_date=?, folder_id=?
                   WHERE id=?""",
                (new_uuid, new_original, ext, new_size, new_mime, now,
                 display_name, description, category_id, tags_norm, expiry_date, folder_id, doc_id)
            )
        return None, (cur["version_num"] or 1) + 1
    except Exception:
        if os.path.exists(save_path):
            os.remove(save_path)
        return "File replacement failed.", None


@app.route("/doc/<int:doc_id>/edit", methods=["POST"])
@login_required
def doc_edit_post(doc_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    _get_doc_or_404(doc_id)  # 404 if not found

    display_name = request.form.get("display_name", "").strip()
    if not display_name:
        flash("Document name is required.", "danger")
        return redirect(url_for("doc_edit_get", doc_id=doc_id))

    description = request.form.get("description", "").strip() or None
    category_id = request.form.get("category_id", 7, type=int)
    raw_tags    = request.form.get("tags", "").strip()
    tags_norm   = _normalize_tags(raw_tags)
    expiry_date = request.form.get("expiry_date", "").strip() or None
    folder_id   = request.form.get("folder_id", type=int)  # None = root

    new_file = request.files.get("new_file")
    if new_file and new_file.filename:
        err, new_version = _replace_doc_file(
            doc_id, new_file,
            request.form.get("version_note", "").strip() or None,
            display_name, description, category_id, tags_norm, expiry_date, folder_id,
        )
        if err:
            flash(err, "danger")
            return redirect(url_for("doc_edit_get", doc_id=doc_id))
        flash(f'"{display_name}" updated — file saved as v{new_version}.', "success")
    else:
        with get_db() as conn:
            conn.execute(
                """UPDATE documents SET display_name=?, description=?, category_id=?,
                   tags=?, expiry_date=?, folder_id=? WHERE id=?""",
                (display_name, description, category_id, tags_norm, expiry_date, folder_id, doc_id),
            )
        flash("Document updated.", "success")

    return redirect(url_for("doc_detail", doc_id=doc_id))


@app.route("/doc/<int:doc_id>/delete", methods=["POST"])
@login_required
def doc_delete(doc_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    doc = _get_doc_or_404(doc_id)

    with get_db() as conn:
        ver_files = conn.execute(
            "SELECT uuid, file_ext FROM document_versions WHERE document_id=?", (doc_id,)
        ).fetchall()

    for v in ver_files:
        vpath = os.path.join(UPLOAD_DIR, v["uuid"] + v["file_ext"])
        if os.path.exists(vpath):
            os.remove(vpath)

    path = _get_doc_path(doc)
    if os.path.exists(path):
        os.remove(path)

    with get_db() as conn:
        conn.execute("DELETE FROM document_versions WHERE document_id=?", (doc_id,))
        conn.execute("DELETE FROM documents WHERE id=?", (doc_id,))

    flash("Document deleted.", "success")
    return redirect(url_for("dashboard"))

# ---------------------------------------------------------------------------
# Document version routes
# ---------------------------------------------------------------------------
@app.route("/doc/<int:doc_id>/version/<int:ver_id>/download", methods=["GET"])
@login_required
def doc_version_download(doc_id, ver_id):
    with get_db() as conn:
        ver = conn.execute(
            "SELECT * FROM document_versions WHERE id=? AND document_id=?",
            (ver_id, doc_id)
        ).fetchone()
    if ver is None:
        abort(404)
    path = os.path.join(UPLOAD_DIR, ver["uuid"] + ver["file_ext"])
    if not os.path.exists(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=ver["original_name"])


@app.route("/doc/<int:doc_id>/version/<int:ver_id>/restore", methods=["POST"])
@login_required
def doc_version_restore(doc_id, ver_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    with get_db() as conn:
        ver = conn.execute(
            "SELECT * FROM document_versions WHERE id=? AND document_id=?",
            (ver_id, doc_id)
        ).fetchone()
    if ver is None:
        abort(404)
    vpath = os.path.join(UPLOAD_DIR, ver["uuid"] + ver["file_ext"])
    if not os.path.exists(vpath):
        flash("Version file not found on disk — cannot restore.", "danger")
        return redirect(url_for("doc_detail", doc_id=doc_id))

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with get_db() as conn:
        cur = conn.execute(
            "SELECT uuid, file_ext, file_size, mime_type, original_name, version_num FROM documents WHERE id=?",
            (doc_id,)
        ).fetchone()
        conn.execute(
            """INSERT INTO document_versions
               (document_id, version_num, uuid, original_name, file_ext, file_size, mime_type, version_note, replaced_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (doc_id, cur["version_num"], cur["uuid"], cur["original_name"],
             cur["file_ext"], cur["file_size"], cur["mime_type"],
             f"Restored v{ver['version_num']}", now)
        )
        conn.execute(
            """UPDATE documents SET uuid=?, original_name=?, file_ext=?, file_size=?,
               mime_type=?, version_num=version_num+1, uploaded_at=? WHERE id=?""",
            (ver["uuid"], ver["original_name"], ver["file_ext"], ver["file_size"],
             ver["mime_type"], now, doc_id)
        )
        conn.execute("DELETE FROM document_versions WHERE id=?", (ver_id,))

    flash(f"v{ver['version_num']} restored successfully.", "success")
    return redirect(url_for("doc_detail", doc_id=doc_id))


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------
@app.route("/categories")
@login_required
def categories_list():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT c.*, COUNT(d.id) AS doc_count
            FROM categories c
            LEFT JOIN documents d ON d.category_id = c.id
            GROUP BY c.id
            ORDER BY c.is_default DESC, c.name
        """).fetchall()
    return render_template("categories.html", categories=rows)


@app.route("/categories/add", methods=["POST"])
@login_required
def category_add():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    name = request.form.get("name", "").strip()
    icon = request.form.get("icon", "folder").strip() or "folder"
    if not name:
        flash("Category name is required.", "danger")
        return redirect(url_for("categories_list"))
    slug = name.lower().replace(" ", "-")
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO categories (name, slug, icon, is_default) VALUES (?, ?, ?, 0)",
                (name, slug, icon),
            )
        flash(f'Category "{name}" added.', "success")
    except sqlite3.IntegrityError:
        flash(f'Category "{name}" already exists.', "danger")
    return redirect(url_for("categories_list"))


@app.route("/categories/<int:cat_id>/delete", methods=["POST"])
@login_required
def category_delete(cat_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    with get_db() as conn:
        cat = conn.execute("SELECT * FROM categories WHERE id = ?", (cat_id,)).fetchone()
        if cat is None:
            abort(404)
        if cat["is_default"]:
            flash("Default categories cannot be deleted.", "danger")
            return redirect(url_for("categories_list"))
        count = conn.execute(
            "SELECT COUNT(*) FROM documents WHERE category_id = ?", (cat_id,)
        ).fetchone()[0]
        if count > 0:
            flash(f"Cannot delete: {count} document(s) use this category.", "danger")
            return redirect(url_for("categories_list"))
        conn.execute("DELETE FROM categories WHERE id = ?", (cat_id,))
    flash("Category deleted.", "success")
    return redirect(url_for("categories_list"))

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
@app.route("/settings", methods=["GET"])
@login_required
def settings_get():
    backup_keep = int(_get_setting("backup_keep", str(BACKUP_KEEP)))
    return render_template(
        "settings.html",
        theme=_get_setting("theme", "dark"),
        backups=_list_backups(),
        backup_dir=BACKUP_DIR,
        backup_keep=backup_keep,
    )


@app.route("/settings/password", methods=["POST"])
@login_required
def settings_password():
    global HASHED_PASSWORD
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    current  = request.form.get("current_password", "")
    new_pw   = request.form.get("new_password", "")
    confirm  = request.form.get("confirm_password", "")

    if not check_password_hash(HASHED_PASSWORD, current):
        flash("Current password is incorrect.", "danger")
        return redirect(url_for("settings_get"))
    if len(new_pw) < 6:
        flash("New password must be at least 6 characters.", "danger")
        return redirect(url_for("settings_get"))
    if new_pw != confirm:
        flash("New passwords do not match.", "danger")
        return redirect(url_for("settings_get"))

    new_hash = generate_password_hash(new_pw)
    _set_setting("password_hash", new_hash)
    HASHED_PASSWORD = new_hash
    flash("Password updated successfully.", "success")
    return redirect(url_for("settings_get"))


@app.route("/settings/theme", methods=["POST"])
@login_required
def settings_theme():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    theme = request.form.get("theme", "dark")
    if theme not in ("dark", "light"):
        theme = "dark"
    _set_setting("theme", theme)
    flash(f"Theme changed to {theme} mode.", "success")
    return redirect(url_for("settings_get"))


# ---------------------------------------------------------------------------
# Backup
# ---------------------------------------------------------------------------

BACKUP_KEEP = 3  # default — overridden at runtime by DB setting


def _get_backup_keep():
    return int(_get_setting("backup_keep", str(BACKUP_KEEP)))


def _backup_filename():
    return f"docvault-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.tar.gz"


def _list_backups():
    """Return backup files sorted newest first."""
    if not os.path.isdir(BACKUP_DIR):
        return []
    files = []
    for name in os.listdir(BACKUP_DIR):
        if name.startswith("docvault-backup-") and name.endswith(".tar.gz"):
            path = os.path.join(BACKUP_DIR, name)
            stat = os.stat(path)
            files.append({
                "name":     name,
                "size":     _human_size(stat.st_size),
                "size_raw": stat.st_size,
                "mtime":    datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
            })
    return sorted(files, key=lambda f: f["name"], reverse=True)


def _create_backup():
    """Create a .tar.gz of DB + uploads, prune old backups, return filename."""
    os.makedirs(BACKUP_DIR, exist_ok=True)
    name    = _backup_filename()
    outpath = os.path.join(BACKUP_DIR, name)

    with tarfile.open(outpath, "w:gz") as tar:
        # Database
        if os.path.isfile(DB_PATH):
            tar.add(DB_PATH, arcname="docvault.db")
        # Uploads directory
        if os.path.isdir(UPLOAD_DIR):
            tar.add(UPLOAD_DIR, arcname="uploads")

    # Prune: keep only the last N backups (configurable)
    all_backups = sorted(
        [f for f in os.listdir(BACKUP_DIR) if f.startswith("docvault-backup-") and f.endswith(".tar.gz")]
    )
    for old in all_backups[:-_get_backup_keep()]:
        try:
            os.remove(os.path.join(BACKUP_DIR, old))
        except OSError:
            pass

    return name


@app.route("/settings/backup", methods=["POST"])
@login_required
def settings_backup_create():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    try:
        name = _create_backup()
        size = _human_size(os.path.getsize(os.path.join(BACKUP_DIR, name)))
        flash(f"Backup created: {name} ({size})", "success")
    except Exception as e:
        flash(f"Backup failed: {e}", "danger")
    return redirect(url_for("settings_get"))


@app.route("/settings/backup/<path:filename>/download", methods=["GET"])
@login_required
def settings_backup_download(filename):
    # Prevent path traversal
    if "/" in filename or "\\" in filename or ".." in filename:
        abort(400)
    path = os.path.join(BACKUP_DIR, filename)
    if not os.path.isfile(path):
        abort(404)
    return send_file(path, as_attachment=True, download_name=filename)


@app.route("/settings/backup/<path:filename>/delete", methods=["POST"])
@login_required
def settings_backup_delete(filename):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    if "/" in filename or "\\" in filename or ".." in filename:
        abort(400)
    path = os.path.join(BACKUP_DIR, filename)
    if os.path.isfile(path):
        os.remove(path)
        flash(f"Backup {filename} deleted.", "success")
    return redirect(url_for("settings_get"))


@app.route("/settings/backup/config", methods=["POST"])
@login_required
def settings_backup_config():
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    try:
        keep = int(request.form.get("backup_keep", "3"))
        keep = max(1, min(keep, 30))
        _set_setting("backup_keep", str(keep))
        flash(f"Backup settings saved — keeping last {keep} backups.", "success")
    except (ValueError, TypeError):
        flash("Invalid backup retention value.", "danger")
    return redirect(url_for("settings_get"))


# ---------------------------------------------------------------------------
# Daily auto-backup scheduler
# ---------------------------------------------------------------------------

def _daily_backup_loop():
    """Background thread: create a backup once per day at ~02:00 local time."""
    while True:
        now = datetime.now()
        target = now.replace(hour=2, minute=0, second=0, microsecond=0)
        if target <= now:
            target = target.replace(day=target.day + 1)
        time.sleep((target - now).total_seconds())
        try:
            _create_backup()
        except Exception:
            pass


# Start scheduler once — the WERKZEUG_RUN_MAIN guard prevents a second
# thread from spawning when the dev-server reloader forks.
if os.environ.get("WERKZEUG_RUN_MAIN", "true") == "true":
    threading.Thread(target=_daily_backup_loop, daemon=True, name="daily-backup").start()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    init_db()
    seed_categories()
    seed_settings()
    _reload_password_hash()
    app.run(host="0.0.0.0", port=9091, debug=False)
