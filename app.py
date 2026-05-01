import os
import uuid
import sqlite3
import functools
import secrets
from datetime import datetime, date, timedelta
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, send_file, flash, abort, jsonify
)
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_PASSWORD  = os.environ.get("APP_PASSWORD", "changeme")
SECRET_KEY    = os.environ.get("SECRET_KEY", secrets.token_hex(32))
DB_PATH       = os.environ.get("DB_PATH", "/data/docvault.db")
UPLOAD_DIR    = os.environ.get("UPLOAD_DIR", "/data/uploads")
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

            CREATE TABLE IF NOT EXISTS documents (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid          TEXT    NOT NULL UNIQUE,
                original_name TEXT    NOT NULL,
                display_name  TEXT    NOT NULL,
                description   TEXT,
                category_id   INTEGER NOT NULL DEFAULT 7,
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
        """)


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
    return d


def _human_size(size):
    for unit in ("B", "KB", "MB"):
        if size < 1024:
            return f"{size:.0f} {unit}"
        size /= 1024
    return f"{size:.1f} GB"


def _search_documents(q=None, category_id=None, tag=None, expiry_filter=None):
    conditions, params = [], []

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

    docs = _search_documents(
        q=q or None,
        category_id=category_id,
        tag=tag or None,
        expiry_filter=expiry_filter or None,
    )

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

    return render_template(
        "dashboard.html",
        docs=docs,
        categories=categories,
        total=total,
        expiring_count=expiring_count,
        expired_count=expired_count,
        q=q,
        selected_category_id=category_id,
        selected_tag=tag,
        expiry_filter=expiry_filter,
    )

# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------
@app.route("/upload", methods=["GET"])
@login_required
def upload_get():
    with get_db() as conn:
        categories = conn.execute("SELECT * FROM categories ORDER BY name").fetchall()
    return render_template("upload.html", categories=categories)


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

    with get_db() as conn:
        conn.execute(
            """INSERT INTO documents
               (uuid, original_name, display_name, description, category_id, tags,
                file_ext, file_size, mime_type, expiry_date, uploaded_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                file_uuid, original_name, display_name, description, category_id,
                tags_norm, ext, file_size, ALLOWED_EXTENSIONS[ext],
                expiry_date, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            ),
        )

    flash(f'"{display_name}" uploaded successfully.', "success")
    return redirect(url_for("dashboard"))


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
    return render_template("preview.html", doc=doc)


@app.route("/doc/<int:doc_id>/preview-file")
@login_required
def doc_preview_file(doc_id):
    doc  = _get_doc_or_404(doc_id)
    path = _get_doc_path(doc)
    if not os.path.exists(path):
        abort(404)
    return send_file(path, mimetype=doc["mime_type"])


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
    return render_template("edit.html", doc=doc, categories=categories)


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

    with get_db() as conn:
        conn.execute(
            """UPDATE documents SET display_name=?, description=?, category_id=?,
               tags=?, expiry_date=? WHERE id=?""",
            (display_name, description, category_id, tags_norm, expiry_date, doc_id),
        )

    flash("Document updated.", "success")
    return redirect(url_for("doc_detail", doc_id=doc_id))


@app.route("/doc/<int:doc_id>/delete", methods=["POST"])
@login_required
def doc_delete(doc_id):
    if not _validate_csrf(request.form.get("csrf_token")):
        abort(400)
    doc  = _get_doc_or_404(doc_id)
    path = _get_doc_path(doc)
    if os.path.exists(path):
        os.remove(path)
    with get_db() as conn:
        conn.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
    flash("Document deleted.", "success")
    return redirect(url_for("dashboard"))

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
    return render_template("settings.html", theme=_get_setting("theme", "dark"))


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
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    init_db()
    seed_categories()
    seed_settings()
    _reload_password_hash()
    app.run(host="0.0.0.0", port=9091, debug=False)
