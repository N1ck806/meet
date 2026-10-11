#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 Запуск на Render — только сервер + Aiven PostgreSQL

Переменные окружения (Render → Environment):
  DATABASE_URL  — строка подключения к Aiven PostgreSQL
  PORT          — Render задаёт сам
  DEBUG         — "1" чтобы видеть подробный вывод (опционально)

Запуск:  python start.py
"""

import http.server
import socketserver
import os
import sys
import json
from datetime import datetime
from pathlib import Path

# ============================================
#  НАСТРОЙКИ
# ============================================
PORT = int(os.environ.get("PORT", 10000))
HOST = "0.0.0.0"
DATABASE_URL = os.environ.get("DATABASE_URL", "")
DEBUG = os.environ.get("DEBUG", "1") == "1"


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
    log("  ║   💕  DATE INVITATION  💕                        ║", C.PINK + C.BOLD)
    log("  ║   Render + Aiven PostgreSQL                      ║", C.PINK + C.BOLD)
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
    """Скрывает пароль из строки подключения."""
    if not url:
        return "(пусто)"
    try:
        # postgres://user:pass@host:port/db
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
        log("⚠ DATABASE_URL не задан в переменных окружения!", C.YELLOW)
        return None

    try:
        conn = psycopg2.connect(DATABASE_URL, connect_timeout=10)
        return conn
    except Exception as e:
        log(f"❌ Ошибка подключения к БД: {e}", C.RED)
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

        # Проверяем, что таблица создана
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables
            WHERE table_name = 'meet_answers'
        """)
        exists = cur.fetchone()[0]
        if exists:
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
    """Возвращает dict со статусом БД для /db-status."""
    status = {
        "database_url_set": bool(DATABASE_URL),
        "database_url_masked": mask_url(DATABASE_URL),
        "connected": False,
        "table_exists": False,
        "records_count": 0,
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
        log("⚠ БД недоступна — ответ НЕ сохранён", C.YELLOW)
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
    """Возвращает все ответы из БД."""
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

        answers = []
        for r in rows:
            answers.append({
                "id": r[0],
                "received_at": str(r[1]),
                "place": r[2],
                "place_emoji": r[3],
                "day": r[4],
                "time": r[5],
                "her_name": r[6],
                "his_name": r[7],
                "user_agent": r[8],
            })
        return answers
    except Exception as e:
        log(f"❌ Ошибка чтения из БД: {e}", C.RED)
        return None


def print_meet(record, saved):
    log("")
    log("═" * 55, C.PINK + C.BOLD)
    log("  💕  НОВЫЙ ОТВЕТ!  💕", C.PINK + C.BOLD)
    log("═" * 55, C.PINK)
    log(f"  {record['place_emoji']}  Место:  {record['place']}", C.BOLD)
    log(f"  📅  День:   {record['day']}", C.BOLD)
    log(f"  🕐  Время:  {record['time']}", C.BOLD)
    log(f"  💝  Она:    {record['her_name']}")
    log(f"  💌  Он:     {record['his_name']}")
    if saved:
        log(f"  ✅ Сохранено в PostgreSQL  •  id={record.get('id')}  •  {record['received_at']}", C.GREEN)
    else:
        log(f"  ⚠ НЕ сохранено в БД  •  {record['received_at']}", C.YELLOW)
    log("═" * 55, C.PINK + C.BOLD)
    log("")


# ============================================
#  HTML-СТРАНИЦА СО СПИСКОМ ОТВЕТОВ
# ============================================
def render_answers_page(answers):
    if answers is None:
        return "<h1>❌ Не удалось подключиться к БД</h1>"

    if not answers:
        body = "<p class='empty'>Пока никто не ответил 💤</p>"
    else:
        cards = []
        for a in answers:
            cards.append(f"""
                <div class="card">
                    <div class="head">
                        <span class="emoji">{a['place_emoji']}</span>
                        <span class="place">{a['place']}</span>
                    </div>
                    <div class="row"><span class="label">📅 День:</span> <b>{a['day']}</b></div>
                    <div class="row"><span class="label">🕐 Время:</span> <b>{a['time']}</b></div>
                    <div class="row"><span class="label">💝 Она:</span> {a['her_name']}</div>
                    <div class="row"><span class="label">💌 Он:</span> {a['his_name']}</div>
                    <div class="meta">#{a['id']} · {a['received_at']}</div>
                </div>
            """)
        body = "".join(cards)

    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>💕 Ответы</title>
<style>
    body {{ font-family: -apple-system, sans-serif; background: linear-gradient(135deg, #ffe0ec, #ffc2dd);
           min-height: 100vh; padding: 30px 16px; color: #4a1f3d; margin: 0; }}
    h1 {{ text-align: center; color: #c9184a; font-size: 2rem; margin-bottom: 8px; }}
    .count {{ text-align: center; color: #7a4a63; margin-bottom: 24px; }}
    .card {{ background: white; border-radius: 20px; padding: 20px 24px; margin: 12px auto;
            max-width: 480px; box-shadow: 0 8px 30px rgba(255,107,157,0.25); }}
    .head {{ display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
            padding-bottom: 12px; border-bottom: 1px solid #ffe0ec; }}
    .emoji {{ font-size: 2rem; }}
    .place {{ font-size: 1.3rem; font-weight: 700; color: #c9184a; }}
    .row {{ margin: 6px 0; font-size: 0.95rem; }}
    .label {{ color: #7a4a63; }}
    .meta {{ margin-top: 12px; padding-top: 10px; border-top: 1px dashed #ffe0ec;
            color: #b08898; font-size: 0.75rem; }}
    .empty {{ text-align: center; color: #b08898; font-size: 1.2rem; padding: 60px 20px; }}
    .refresh {{ display: block; text-align: center; margin: 20px auto; padding: 12px 24px;
              background: linear-gradient(135deg, #ff6b9d, #c9184a); color: white;
              text-decoration: none; border-radius: 50px; font-weight: 600;
              max-width: 200px; box-shadow: 0 8px 25px rgba(201,24,74,0.4); }}
</style>
</head>
<body>
    <h1>💕 Все ответы</h1>
    <div class="count">Всего: {len(answers)}</div>
    {body}
    <a class="refresh" href="/answers">🔄 Обновить</a>
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # ---- /health ----
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
            return

        # ---- /db-status ----
        if self.path == "/db-status":
            status = get_db_status()
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps(status, ensure_ascii=False, indent=2).encode("utf-8"))
            return

        # ---- /answers ----
        if self.path == "/answers":
            answers = fetch_all_answers()
            html = render_answers_page(answers)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            self.wfile.write(html.encode("utf-8"))
            return

        # ---- Обычная отдача файлов ----
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/answer":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                data = json.loads(body)
                data["user_agent"] = self.headers.get("User-Agent", "—")

                record, saved = save_meet(data)
                print_meet(record, saved)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "saved": saved}).encode())
            except Exception as e:
                log(f"❌ Ошибка при сохранении: {e}", C.RED)
                self.send_response(500)
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()


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
        log("   Проверь DATABASE_URL в Render → Environment", C.YELLOW)

    log(f"🚀 Сервер запущен на порту {PORT}", C.GREEN)
    log(f"   🌐 https://<твой-сервис>.onrender.com/health", C.CYAN)
    log(f"   🗄  https://<твой-сервис>.onrender.com/db-status", C.CYAN)
    log(f"   📋 https://<твой-сервис>.onrender.com/answers", C.CYAN)
    log("")

    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer((HOST, PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        log("\n💕 Сервер остановлен\n", C.PINK)


if __name__ == "__main__":
    main()