#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 Запуск на Render — только сервер + Aiven PostgreSQL
Никаких туннелей, никакого браузера. Только API и статика.

Переменные окружения (задать в Render → Environment):
  DATABASE_URL  — строка подключения к Aiven PostgreSQL
  PORT          — Render задаёт сам (не трогать)

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

# Aiven PostgreSQL — берём из переменной окружения Render
DATABASE_URL = os.environ.get("DATABASE_URL", "")

class C:
    PINK   = "\033[95m"
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    CYAN   = "\033[96m"
    RED    = "\033[91m"
    BOLD   = "\033[1m"
    DIM    = "\033[2m"
    RESET  = "\033[0m"


def banner():
    print()
    print(f"{C.PINK}{C.BOLD}")
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║   💕  DATE INVITATION  💕                        ║")
    print("  ║   Render + Aiven PostgreSQL                      ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print(f"{C.RESET}")


def check_files():
    required = ["index.html", "style.css", "script.js", "config.js"]
    missing = [f for f in required if not Path(f).exists()]
    if missing:
        print(f"{C.RED}❌ Не найдены файлы: {', '.join(missing)}{C.RESET}")
        sys.exit(1)
    print(f"{C.GREEN}✅ Все файлы на месте{C.RESET}")


# ============================================
#  POSTGRESQL (Aiven)
# ============================================
def get_db_connection():
    """Возвращает подключение к PostgreSQL."""
    try:
        import psycopg2
    except ImportError:
        print(f"{C.RED}❌ psycopg2 не установлен. Добавь в requirements.txt{C.RESET}")
        return None

    if not DATABASE_URL:
        print(f"{C.YELLOW}⚠ DATABASE_URL не задан в переменных окружения!{C.RESET}")
        return None

    try:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    except Exception as e:
        print(f"{C.RED}❌ Ошибка подключения к БД: {e}{C.RESET}")
        return None


def init_db():
    """Создаёт таблицу, если её нет."""
    conn = get_db_connection()
    if not conn:
        return False

    try:
        cur = conn.cursor()
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
        cur.close()
        conn.close()
        print(f"{C.GREEN}✅ База данных готова (таблица meet_answers){C.RESET}")
        return True
    except Exception as e:
        print(f"{C.RED}❌ Ошибка создания таблицы: {e}{C.RESET}")
        return False


def save_meet(data):
    """Сохраняет ответ в PostgreSQL."""
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
        print(f"{C.YELLOW}⚠ БД недоступна — ответ НЕ сохранён{C.RESET}")
        return record

    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO meet_answers
            (received_at, place, place_emoji, day, time, her_name, his_name, user_agent)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
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
        conn.commit()
        cur.close()
        conn.close()
    except Exception as e:
        print(f"{C.RED}❌ Ошибка записи в БД: {e}{C.RESET}")

    return record


def print_meet(record):
    """Красивый вывод ответа в логи Render."""
    print()
    print(f"{C.PINK}{C.BOLD}{'═' * 55}{C.RESET}")
    print(f"{C.PINK}{C.BOLD}  💕  НОВЫЙ ОТВЕТ!  💕{C.RESET}")
    print(f"{C.PINK}{'═' * 55}{C.RESET}")
    print(f"  {record['place_emoji']}  Место:  {C.BOLD}{record['place']}{C.RESET}")
    print(f"  📅  День:   {C.BOLD}{record['day']}{C.RESET}")
    print(f"  🕐  Время:  {C.BOLD}{record['time']}{C.RESET}")
    print(f"  💝  Она:    {record['her_name']}")
    print(f"  💌  Он:     {record['his_name']}")
    print(f"{C.DIM}  Сохранено в PostgreSQL  •  {record['received_at']}{C.RESET}")
    print(f"{C.PINK}{'═' * 55}{C.RESET}")
    print()


# ============================================
#  HTTP-ОБРАБОТЧИК
# ============================================
class Handler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        msg = format % args
        if "favicon" in msg:
            return
        print(f"{C.DIM}   → {msg}{C.RESET}")

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
        # Health-check для UptimeRobot, чтобы Render не засыпал
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"OK")
            return
        # Всё остальное — обычная отдача файлов
        super().do_GET()

    def do_POST(self):
        if self.path == "/api/answer":
            try:
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length).decode("utf-8")
                data = json.loads(body)
                data["user_agent"] = self.headers.get("User-Agent", "—")

                record = save_meet(data)
                print_meet(record)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok": true}')
            except Exception as e:
                print(f"{C.RED}❌ Ошибка при сохранении: {e}{C.RESET}")
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

    print(f"{C.CYAN}🗄  Подключаюсь к Aiven PostgreSQL...{C.RESET}")
    if not init_db():
        print(f"{C.YELLOW}⚠ Продолжаю без БД — ответы не сохранятся{C.RESET}")

    print(f"{C.GREEN}🚀 Сервер запущен на порту {PORT}{C.RESET}")
    print(f"{C.DIM}   Render сам даст публичный URL{C.RESET}\n")

    socketserver.TCPServer.allow_reuse_address = True

    try:
        with socketserver.TCPServer((HOST, PORT), Handler) as httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print(f"\n{C.PINK}💕 Сервер остановлен{C.RESET}\n")


if __name__ == "__main__":
    main()