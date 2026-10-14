#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 Запуск на Render — сервер + Aiven PostgreSQL + админка

Переменные окружения (Render → Environment):
  DATABASE_URL        — строка подключения к Aiven PostgreSQL
  PORT                — Render задаёт сам
  ADMIN_PASSWORD      — пароль для /answers и /api/* (опционально, но рекомендую)
  TELEGRAM_BOT_TOKEN  — токен бота (опционально)
  TELEGRAM_CHAT_ID    — твой chat_id (опционально)

Запуск:  python start.py
"""

import http.server
import socketserver
import os
import sys
import json
import csv
import io
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from urllib.request import Request, urlopen
from urllib.error import URLError

# ============================================
#  НАСТРОЙКИ
# ============================================
PORT = int(os.environ.get("PORT", 10000))
HOST = "0.0.0.0"
DATABASE_URL = os.environ.get("DATABASE_URL", "")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


class C:
    PINK   = "\033[95m"
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    RED    = "\033[91m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    RESET  = "\033[0m"


def log(msg, color=C.RESET):
    print(f"{color}{msg}{C.RESET}", flush=True)


def banner():
    log("")
    log("  ╔══════════════════════════════════════════════════╗", C.PINK + C.BOLD)
    log("  ║   💕  Дата свидания  💕                                   ║", C.PINK + C.BOLD)
    log("  ║   Render + Aiven PostgreSQL + Admin                       ║", C.PINK + C.BOLD)
    log("  ╚══════════════════════════════════════════════════╝", C.PINK + C.BOLD)
    log("")


def check_files():
    required = ["index.html", "style.css", "script.js", "config.js"]
    missing = [f for f in required if not Path(f).exists()]
    if missing:
        log(f"❌ Не найдены файлы: {', '.join(missing)}", C.RED)
        sys.exit(1)
    log("✅ Все файлы на месте", C.GREEN)


def mask_url(url):
    if not url:
        return "(пусто)"
    try:
        if "://" in url:
            proto, rest = url.split("://", 1)
            if "@" in rest:
                creds, host = rest.split("@", 1)
                if ":" in creds:
                    user, _ = creds.split(":", 1)
                    return f"{proto}://{user}:***@{host}"
        return url[:50] + "..."
    except Exception:
        return "(ошибка парсинга)"


# ============================================
#  POSTGRESQL
# ============================================
def get_db_connection():
    try:
        import psycopg2
    except ImportError:
        log("❌ psycopg2 не установлен", C.RED)
        return None

    if not DATABASE_URL:
        log("⚠ DATABASE_URL не задан", C.YELLOW)
        return None

    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        return conn
    except Exception as e:
        log(f"❌ Ошибка подключения к Базе данных: {e}", C.RED)
        return None


def init_db():
    log("🗄  Подключаюсь к Aiven PostgreSQL...", C.CYAN)
    log(f"   URL: {mask_url(DATABASE_URL)}", C.DIM)

    conn = get_db_connection()
    if not conn:
        log("❌ БД недоступна", C.RED)
        return False

    try:
        cur = conn.cursor()
        cur.execute("SELECT version();")
        version = cur.fetchone()[0]
        log(f"✅ Подключено: {version[:60]}...", C.GREEN)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS meet_answers (
                id SERIAL PRIMARY KEY,
                received_at TIMESTAMP NOT NULL,
                place TEXT,
                place_emoji TEXT,
                day TEXT,
                time TEXT,
                her_name TEXT,
                his_name TEXT,
                user_agent TEXT
            )
        """)
        conn.commit()

        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'meet_answers'
        """)
        if cur.fetchone()[0]:
            log("✅ Таблица meet_answers готова", C.GREEN)
        else:
            log("⚠ Таблица не создалась", C.YELLOW)

        cur.close()
        conn.close()
        return True
    except Exception as e:
        log(f"❌ Ошибка инициализации БД: {e}", C.RED)
        return False


def get_db_status():
    status = {
        "database_url_set": bool(DATABASE_URL),
        "database_url_masked": mask_url(DATABASE_URL),
        "connected": False,
        "table_exists": False,
        "records_count": 0,
        "admin_protected": bool(ADMIN_PASSWORD),
        "telegram_enabled": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID),
        "error": None,
    }

    try:
        import psycopg2  # noqa
    except ImportError:
        status["error"] = "psycopg2 не установлен"
        return status

    if not DATABASE_URL:
        status["error"] = "DATABASE_URL не задан"
        return status

    try:
        import psycopg2
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        status["connected"] = True

        cur = conn.cursor()
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'meet_answers'
        """)
        if cur.fetchone()[0]:
            status["table_exists"] = True
            cur.execute("SELECT COUNT(*) FROM meet_answers")
            status["records_count"] = cur.fetchone()[0]

        cur.close()
        conn.close()
    except Exception as e:
        status["error"] = str(e)

    return status


def save_meet(data):
    record = {
        "received_at": datetime.now().isoformat(timespec="seconds"),
        "place": data.get("place", "—"),
        "place_emoji": data.get("place_emoji", "📍"),
        "day": data.get("day", "—"),
        "time": data.get("time", "—"),
        "her_name": data.get("her_name", "—"),
        "his_name": data.get("his_name", "—"),
        "user_agent": data.get("user_agent", "—"),
    }

    conn = get_db_connection()
    if not conn:
        log("⚠ База данных недоступна — ответ НЕ сохранён", C.YELLOW)
        return record, False

    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO meet_answers
            (received_at, place, place_emoji, day, time, her_name, his_name, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (
            record["received_at"],
            record["place"],
            record["place_emoji"],
            record["day"],
            record["time"],
            record["her_name"],
            record["his_name"],
            record["user_agent"],
        ))
        new_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()
        record["id"] = new_id
        return record, True
    except Exception as e:
        log(f"❌ Ошибка записи в БД: {e}", C.RED)
        return record, False


def fetch_all_answers():
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, received_at, place, place_emoji, day, time,
                   her_name, his_name, user_agent
            FROM meet_answers
            ORDER BY received_at DESC
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        return [
            {
                "id": r[0],
                "received_at": str(r[1]),
                "place": r[2],
                "place_emoji": r[3],
                "day": r[4],
                "time": r[5],
                "her_name": r[6],
                "his_name": r[7],
                "user_agent": r[8],
            }
            for r in rows
        ]
    except Exception as e:
        log(f"❌ Ошибка чтения из БД: {e}", C.RED)
        return None


def fetch_one_answer(answer_id):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT id, received_at, place, place_emoji, day, time,
                   her_name, his_name, user_agent
            FROM meet_answers WHERE id = %s
        """, (answer_id,))
        r = cur.fetchone()
        cur.close()
        conn.close()
        if not r:
            return None
        return {
            "id": r[0],
            "received_at": str(r[1]),
            "place": r[2],
            "place_emoji": r[3],
            "day": r[4],
            "time": r[5],
            "her_name": r[6],
            "his_name": r[7],
            "user_agent": r[8],
        }
    except Exception as e:
        log(f"❌ Ошибка чтения ответа: {e}", C.RED)
        return None


def clear_all_answers():
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("TRUNCATE TABLE meet_answers RESTART IDENTITY")
        conn.commit()
        cur.close()
        conn.close()
        log("🗑 Все ответы удалены", C.YELLOW)
        return True
    except Exception as e:
        log(f"❌ Ошибка очистки: {e}", C.RED)
        return False


def delete_answer(answer_id):
    conn = get_db_connection()
    if not conn:
        return False
    try:
        cur = conn.cursor()
        cur.execute("DELETE FROM meet_answers WHERE id = %s", (answer_id,))
        affected = cur.rowcount
        conn.commit()
        cur.close()
        conn.close()
        return affected > 0
    except Exception as e:
        log(f"❌ Ошибка удаления: {e}", C.RED)
        return False


def get_stats():
    """Возвращает статистику по ответам."""
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cur = conn.cursor()
        stats = {}

        cur.execute("SELECT COUNT(*) FROM meet_answers")
        stats["total"] = cur.fetchone()[0]

        cur.execute("""
            SELECT place, place_emoji, COUNT(*) as cnt
            FROM meet_answers GROUP BY place, place_emoji ORDER BY cnt DESC
        """)
        stats["by_place"] = [
            {"place": r[0], "emoji": r[1], "count": r[2]} for r in cur.fetchall()
        ]

        cur.execute("""
            SELECT day, COUNT(*) as cnt
            FROM meet_answers GROUP BY day ORDER BY cnt DESC
        """)
        stats["by_day"] = [{"day": r[0], "count": r[1]} for r in cur.fetchall()]

        cur.execute("""
            SELECT time, COUNT(*) as cnt
            FROM meet_answers GROUP BY time ORDER BY cnt DESC
        """)
        stats["by_time"] = [{"time": r[0], "count": r[1]} for r in cur.fetchall()]

        cur.close()
        conn.close()
        return stats
    except Exception as e:
        log(f"❌ Ошибка статистики: {e}", C.RED)
        return None


# ============================================
#  TELEGRAM
# ============================================
def notify_telegram(record):
    if not (TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID):
        return
    text = (
        f"💕 *{record['her_name']} согласилась!*\n\n"
        f"{record['place_emoji']} *Место:* {record['place']}\n"
        f"📅 *День:* {record['day']}\n"
        f"🕐 *Время:* {record['time']}\n\n"
        f"_id={record.get('id', '—')} • {record['received_at']}_"
    )
    try:
        data = json.dumps({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "Markdown",
        }).encode("utf-8")
        req = Request(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            data=data,
            headers={"Content-Type": "application/json"},
        )
        urlopen(req, timeout=10)
        log("📨 Уведомление в Telegram отправлено", C.CYAN)
    except URLError as e:
        log(f"⚠ Не удалось отправить в Telegram: {e}", C.YELLOW)
    except Exception as e:
        log(f"⚠ Telegram error: {e}", C.YELLOW)


# ============================================
#  HTML-АДМИНКА
# ============================================
def render_answers_page(answers, stats):
    if answers is None:
        return "<h1>❌ Не удалось подключиться к БД</h1>"

    # --- Summary cards ---
    places_html = ""
    if stats and stats.get("by_place"):
        for p in stats["by_place"]:
            places_html += f"<span class='tag'>{p['emoji']} {p['place']} · {p['count']}</span>"

    days_html = ""
    if stats and stats.get("by_day"):
        for d in stats["by_day"]:
            days_html += f"<span class='tag'>📅 {d['day']} · {d['count']}</span>"

    times_html = ""
    if stats and stats.get("by_time"):
        for t in stats["by_time"]:
            times_html += f"<span class='tag'>🕐 {t['time']} · {t['count']}</span>"

    # --- Карточки ---
    if not answers:
        cards_html = "<p class='empty'>Пока никто не ответил 💤</p>"
    else:
        cards = []
        for a in answers:
            cards.append(f"""
                <div class="card">
                    <button class="del" onclick="deleteOne({a['id']})" title="Удалить">✕</button>
                    <div class="head">
                        <span class="emoji">{a['place_emoji']}</span>
                        <span class="place">{a['place']}</span>
                    </div>
                    <div class="row"><span class="label">📅 День:</span> <b>{a['day']}</b></div>
                    <div class="row"><span class="label">🕐 Время:</span> <b>{a['time']}</b></div>
                    <div class="row"><span class="label">💝 Избранная:</span> {a['her_name']}</div>
                    <div class="row"><span class="label">💌 Я:</span> {a['his_name']}</div>
                    <div class="meta">#{a['id']} · {a['received_at']}</div>
                </div>
            """)
        cards_html = "".join(cards)

    total = stats["total"] if stats else len(answers)

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>💕 Ответы</title>
<style>
    * {{ box-sizing: border-box; }}
    body {{ font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #ffe0ec, #ffc2dd);
           min-height: 100vh; padding: 30px 16px; color: #4a1f3d; margin: 0; }}
    h1 {{ text-align: center; color: #c9184a; font-size: 2rem; margin: 0 0 8px; }}
    .count {{ text-align: center; color: #7a4a63; margin-bottom: 20px; font-size: 1.05rem; }}
    .toolbar {{ display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 20px; }}
    .btn {{ padding: 10px 22px; border-radius: 50px; border: none; cursor: pointer;
           font-weight: 600; font-size: 0.9rem; text-decoration: none; display: inline-flex;
           align-items: center; gap: 6px; font-family: inherit; transition: transform 0.2s; }}
    .btn:hover {{ transform: translateY(-2px); }}
    .btn-primary {{ background: linear-gradient(135deg, #ff6b9d, #c9184a); color: white;
                   box-shadow: 0 6px 20px rgba(201,24,74,0.35); }}
    .btn-dark {{ background: linear-gradient(135deg, #999, #555); color: white; }}
    .btn-blue {{ background: linear-gradient(135deg, #29b6f6, #0288d1); color: white; }}
    .btn-green {{ background: linear-gradient(135deg, #66bb6a, #2e7d32); color: white; }}
    .stats {{ background: white; border-radius: 20px; padding: 20px; max-width: 600px;
             margin: 0 auto 20px; box-shadow: 0 8px 30px rgba(255,107,157,0.2); }}
    .stats h3 {{ margin: 0 0 12px; color: #c9184a; font-size: 1rem; }}
    .tag-row {{ display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }}
    .tag {{ background: #ffe0ec; color: #c9184a; padding: 6px 14px; border-radius: 50px;
           font-size: 0.8rem; font-weight: 600; }}
    .card {{ position: relative; background: white; border-radius: 20px; padding: 20px 24px;
            margin: 12px auto; max-width: 480px; box-shadow: 0 8px 30px rgba(255,107,157,0.25); }}
    .head {{ display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
            padding-bottom: 12px; border-bottom: 1px solid #ffe0ec; }}
    .emoji {{ font-size: 2rem; }}
    .place {{ font-size: 1.3rem; font-weight: 700; color: #c9184a; }}
    .row {{ margin: 6px 0; font-size: 0.95rem; }}
    .label {{ color: #7a4a63; }}
    .meta {{ margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ffe0ec;
            color: #b08898; font-size: 0.75rem; }}
    .del {{ position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
           border-radius: 50%; border: none; background: #f5f5f5; color: #999;
           cursor: pointer; font-size: 14px; transition: all 0.2s; }}
    .del:hover {{ background: #ff6b9d; color: white; transform: scale(1.1); }}
    .empty {{ text-align: center; color: #b08898; font-size: 1.2rem; padding: 60px 20px; }}
</style>
</head>
<body>
    <h1>💕 Все ответы</h1>
    <div class="count">Всего: <b>{total}</b></div>

    <div class="toolbar">
        <a class="btn btn-primary" href="/answers">🔄 Обновить</a>
        <a class="btn btn-blue" href="/api/export?format=json" download="meet_answers.json">📥 JSON</a>
        <a class="btn btn-green" href="/api/export?format=csv" download="meet_answers.csv">📥 CSV</a>
        <button class="btn btn-dark" onclick="clearAll()">🗑 Очистить всё</button>
    </div>

    {f'<div class="stats"><h3>📍 По местам</h3><div class="tag-row">{places_html}</div><h3>📅 По дням</h3><div class="tag-row">{days_html}</div><h3>🕐 По времени</h3><div class="tag-row">{times_html}</div></div>' if stats and stats.get('total') else ''}

    {cards_html}

    <script>
        function clearAll() {{
            if (!confirm('Удалить ВСЕ ответы? Это действие нельзя отменить.')) return;
            fetch('/api/clear', {{ method: 'POST' }})
                .then(r => r.json())
                .then(() => location.reload())
                .catch(e => alert('Ошибка: ' + e));
        }}
        function deleteOne(id) {{
            if (!confirm('Удалить ответ #' + id + '?')) return;
            fetch('/api/delete/' + id, {{ method: 'DELETE' }})
                .then(r => r.json())
                .then(() => location.reload())
                .catch(e => alert('Ошибка: ' + e));
        }}
    </script>
</body>
</html>"""


def render_login_page(error=""):
    err_html = f"<p class='err'>{error}</p>" if error else ""
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>🔐 Вход</title>
<style>
    body {{ font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #ffe0ec, #ffc2dd);
           min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }}
    .login {{ background: white; padding: 40px; border-radius: 24px; max-width: 340px; width: 90%;
             box-shadow: 0 20px 60px rgba(255,107,157,0.35); text-align: center; }}
    h1 {{ color: #c9184a; margin: 0 0 20px; }}
    input {{ width: 100%; padding: 14px 18px; border: 2px solid #ffe0ec; border-radius: 14px;
            font-size: 1rem; outline: none; font-family: inherit; box-sizing: border-box; }}
    input:focus {{ border-color: #ff6b9d; }}
    button {{ width: 100%; padding: 14px; margin-top: 16px; border: none; border-radius: 14px;
             background: linear-gradient(135deg, #ff6b9d, #c9184a); color: white;
             font-size: 1rem; font-weight: 600; cursor: pointer; font-family: inherit; }}
    .err {{ color: #e63946; margin: 12px 0 0; font-size: 0.9rem; }}
</style>
</head>
<body>
    <form class="login" method="POST" action="/login">
        <h1>🔐 Вход</h1>
        <input type="password" name="password" placeholder="Пароль" autofocus required>
        <button type="submit">Войти</button>
        {err_html}
    </form>
</body>
</html>"""


# ============================================
#  HTTP-ОБРАБОТЧИК
# ============================================
class Handler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        msg = format % args
        if "favicon" in msg:
            return
        log(f"   → {msg}", C.DIM)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    # ---------- АВТОРИЗАЦИЯ ----------
    def is_authorized(self):
        if not ADMIN_PASSWORD:
            return True
        cookie = self.headers.get("Cookie", "")
        return f"admin={ADMIN_PASSWORD}" in cookie

    def require_auth(self):
        """Возвращает True, если доступ разрешён. Иначе шлёт 401."""
        if self.is_authorized():
            return True
        self.send_response(401)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(render_login_page().encode("utf-8"))
        return False

    # ---------- OPTIONS ----------
    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    # ---------- GET ----------
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)

        # ---- /health ----
        if path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        # ---- /db-status ----
        if path == "/db-status":
            status = get_db_status()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(status, ensure_ascii=False, indent=2).encode("utf-8"))
            return

        # ---- /login (GET — форма) ----
        if path == "/login":
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(render_login_page().encode("utf-8"))
            return

        # ---- /logout ----
        if path == "/logout":
            self.send_response(302)
            self.send_header("Set-Cookie", "admin=; Max-Age=0; Path=/")
            self.send_header("Location", "/login")
            self.end_headers()
            return

        # ---- /answers ----
        if path == "/answers":
            if not self.require_auth():
                return
            answers = fetch_all_answers()
            stats = get_stats()
            html = render_answers_page(answers, stats)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
            return

        # ---- /stats ----
        if path == "/stats":
            if not self.require_auth():
                return
            stats = get_stats()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(stats, ensure_ascii=False, indent=2).encode("utf-8"))
            return

        # ---- /api/export ----
        if path == "/api/export":
            if not self.require_auth():
                return
            fmt = query.get("format", ["json"])[0]
            answers = fetch_all_answers() or []

            if fmt == "csv":
                output = io.StringIO()
                writer = csv.writer(output)
                writer.writerow(["id", "received_at", "place", "place_emoji",
                                 "day", "time", "her_name", "his_name", "user_agent"])
                for a in answers:
                    writer.writerow([
                        a["id"], a["received_at"], a["place"], a["place_emoji"],
                        a["day"], a["time"], a["her_name"], a["his_name"], a["user_agent"],
                    ])
                content = output.getvalue().encode("utf-8-sig")
                self.send_response(200)
                self.send_header("Content-Type", "text/csv; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="meet_answers.csv"')
                self.end_headers()
                self.wfile.write(content)
            else:
                content = json.dumps(answers, ensure_ascii=False, indent=2).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Disposition", 'attachment; filename="meet_answers.json"')
                self.end_headers()
                self.wfile.write(content)
            return

        # ---- Обычная отдача файлов ----
        super().do_GET()

    # ---------- POST ----------
    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ---- /login ----
        if path == "/login":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length).decode("utf-8")
            params = parse_qs(body)
            password = params.get("password", [""])[0]

            if password == ADMIN_PASSWORD:
                self.send_response(302)
                self.send_header("Set-Cookie", f"admin={ADMIN_PASSWORD}; Path=/; HttpOnly")
                self.send_header("Location", "/answers")
                self.end_headers()
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                self.wfile.write(render_login_page("Неверный пароль").encode("utf-8"))
            return

        # ---- /api/answer ----
        if path == "/api/answer":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                data = json.loads(body)
                data["user_agent"] = self.headers.get("User-Agent", "—")

                record, saved = save_meet(data)
                print_meet(record, saved)
                if saved:
                    notify_telegram(record)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "saved": saved}).encode())
            except Exception as e:
                log(f"❌ Ошибка при сохранении: {e}", C.RED)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        # ---- /api/clear ----
        if path == "/api/clear":
            if not self.require_auth():
                return
            ok = clear_all_answers()
            self.send_response(200 if ok else 500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": ok}).encode())
            return

        self.send_response(404)
        self.end_headers()

    # ---------- DELETE ----------
    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path

        # ---- /api/delete/{id} ----
        if path.startswith("/api/delete/"):
            if not self.require_auth():
                return
            try:
                answer_id = int(path.split("/")[-1])
                ok = delete_answer(answer_id)
                self.send_response(200 if ok else 404)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": ok}).encode())
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        self.send_response(404)
        self.end_headers()


def print_meet(record, saved):
    log("")
    log("═" * 55, C.PINK + C.BOLD)
    log("  💕  НОВЫЙ ОТВЕТ!  💕", C.PINK + C.BOLD)
    log("═" * 55, C.PINK)
    log(f"  {record['place_emoji']}  Место:  {record['place']}", C.BOLD)
    log(f"  📅  День:   {record['day']}", C.BOLD)
    log(f"  🕐  Время:  {record['time']}", C.BOLD)
    log(f"  💝  Избранница:    {record['her_name']}")
    log(f"  💌  Я:     {record['his_name']}")
    if saved:
        log(f"  ✅ Сохранено  •  id={record.get('id')}  •  {record['received_at']}", C.GREEN)
    else:
        log(f"  ⚠ НЕ сохранено  •  {record['received_at']}", C.YELLOW)
    log("═" * 55, C.PINK + C.BOLD)
    log("")


# ============================================
#  ГЛАВНАЯ
# ============================================
def main():
    os.chdir(Path(__file__).parent)

    banner()
    check_files()

    db_ok = init_db()
    if not db_ok:
        log("⚠ Продолжаю без БД — ответы НЕ сохранятся", C.YELLOW)

    if ADMIN_PASSWORD:
        log("🔐 Админка защищена паролем", C.GREEN)
    else:
        log("⚠ ADMIN_PASSWORD не задан — админка открыта всем!", C.YELLOW)

    if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID:
        log("📨 Telegram-уведомления включены", C.GREEN)

    log(f"🚀 Сервер запущен на порту {PORT}", C.GREEN)
    log(f"   🌐 /health         — ping", C.CYAN)
    log(f"   🗄  /db-status      — статус БД", C.CYAN)
    log(f"   📋 /answers        — список ответов", C.CYAN)
    log(f"   📊 /stats          — статистика (JSON)", C.CYAN)
    log(f"   📥 /api/export     — экспорт (json/csv)", C.CYAN)
    log(f"   🔐 /login          — вход", C.CYAN)
    log(f"   🚪 /logout         — выход", C.CYAN)
    log("")

    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer((HOST, PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        log("\n💕 Сервер остановлен\n", C.PINK)


if __name__ == "__main__":
    main()
