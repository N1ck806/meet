#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
🚀 Локальный запуск + API для сохранения ответа в meet.json
+ Автоматический Cloudflare Quick Tunnel (публичная ссылка)

Запуск:  python run.py
"""

import http.server
import socketserver
import webbrowser
import socket
import os
import sys
import json
import threading
import time
import subprocess
import shutil
import re
from datetime import datetime
from pathlib import Path

# ============================================
#  НАСТРОЙКИ
# ============================================
PORT = 8000
AUTO_OPEN = True
HOST = "0.0.0.0"
MEET_FILE = "meet.json"

# Cloudflare Tunnel
USE_TUNNEL = True                 # True — пытаться запустить cloudflared
TUNNEL_TIMEOUT = 40               # сколько секунд ждать ссылку от cloudflared


class C:
    PINK   = "\033[95m"
    PURPLE = "\033[94m"
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
    print("  ║   💕  Дата свидания.  💕                                  ║")
    print("  ║   Локальный запуск + Cloudflare Tunnel.                   ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print(f"{C.RESET}")


def check_files():
    required = ["index.html", "style.css", "script.js", "config.js"]
    missing = [f for f in required if not Path(f).exists()]
    if missing:
        print(f"{C.RED}❌ Не найдены файлы:{C.RESET}")
        for f in missing:
            print(f"   • {f}")
        sys.exit(1)
    print(f"{C.GREEN}✅ Все файлы на месте:{C.RESET} {', '.join(required)}")


def find_free_port(start=8000, attempts=20):
    for port in range(start, start + attempts):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("", port))
                return port
            except OSError:
                continue
    raise RuntimeError("Ошибка. Не удалось найти свободный порт")


def get_local_ip():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"


# ============================================
#  CLOUDFLARE QUICK TUNNEL
# ============================================
def find_cloudflared():
    """Ищет cloudflared в PATH или рядом с run.py."""
    # 1. В PATH
    path = shutil.which("cloudflared") or shutil.which("cloudflared.exe")
    if path:
        return path

    # 2. Рядом с run.py
    local = Path(__file__).parent / "cloudflared.exe"
    if local.exists():
        return str(local)
    local_nix = Path(__file__).parent / "cloudflared"
    if local_nix.exists():
        return str(local_nix)

    return None


def start_tunnel(port):
    """
    Запускает cloudflared и возвращает публичную ссылку.
    Возвращает None, если не удалось.
    """
    cloudflared = find_cloudflared()
    if not cloudflared:
        print(f"{C.YELLOW}⚠ cloudflared не найден. Публичная ссылка не создана.{C.RESET}")
        print(f"{C.DIM}  Установи: winget install Cloudflare.cloudflared{C.RESET}")
        print(f"{C.DIM}  Или скачай: https://github.com/cloudflare/cloudflared/releases{C.RESET}")
        return None

    print(f"{C.CYAN}🌐 Запускаю Cloudflare Tunnel...{C.RESET}")

    try:
        # Запускаем процесс
        creationflags = 0
        if sys.platform == "win32":
            creationflags = subprocess.CREATE_NO_WINDOW

        proc = subprocess.Popen(
            [cloudflared, "tunnel", "--url", f"http://localhost:{port}"],
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            creationflags=creationflags,
        )
    except Exception as e:
        print(f"{C.RED}❌ Ошибка запуска cloudflared: {e}{C.RESET}")
        return None

    # Ищем ссылку в выводе
    url_pattern = re.compile(r"https://[a-zA-Z0-9\-]+\.trycloudflare\.com")
    public_url = None
    start_time = time.time()

    while time.time() - start_time < TUNNEL_TIMEOUT:
        line = proc.stdout.readline()
        if not line:
            if proc.poll() is not None:
                break
            time.sleep(0.1)
            continue

        # Ищем ссылку
        match = url_pattern.search(line)
        if match:
            public_url = match.group(0)
            break

    if not public_url:
        print(f"{C.RED}❌ Не удалось получить ссылку от cloudflared{C.RESET}")
        try:
            proc.terminate()
        except Exception:
            pass
        return None

    print(f"{C.GREEN}✅ Туннель создан!{C.RESET}")
    return public_url


# ============================================
#  СОХРАНЕНИЕ ОТВЕТА
# ============================================
def save_meet(data):
    """Дописывает ответ в meet.json. Если файла нет — создаёт."""
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

    records = []
    if Path(MEET_FILE).exists():
        try:
            with open(MEET_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
                if isinstance(existing, list):
                    records = existing
                elif isinstance(existing, dict):
                    records = [existing]
        except Exception:
            records = []

    records.append(record)

    with open(MEET_FILE, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    return record


def print_meet(record):
    """Красивый вывод ответа в терминал."""
    print()
    print(f"{C.PINK}{C.BOLD}{'═' * 55}{C.RESET}")
    print(f"{C.PINK}{C.BOLD}  💕  НОВЫЙ ОТВЕТ!  💕{C.RESET}")
    print(f"{C.PINK}{'═' * 55}{C.RESET}")
    print(f"  {record['place_emoji']}  Место:  {C.BOLD}{record['place']}{C.RESET}")
    print(f"  📅  День:   {C.BOLD}{record['day']}{C.RESET}")
    print(f"  🕐  Время:  {C.BOLD}{record['time']}{C.RESET}")
    print(f"  💝  Она:    {record['her_name']}")
    print(f"  💌  Он:     {record['his_name']}")
    print(f"{C.DIM}  Сохранено в {MEET_FILE}  •  {record['received_at']}{C.RESET}")
    print(f"{C.PINK}{'═' * 55}{C.RESET}")
    print()


# ============================================
#  КРАСИВЫЙ ФИНАЛЬНЫЙ ВЫВОД
# ============================================
def print_links(local_url, lan_url, public_url):
    """Красивая финальная плашка со ссылками."""
    print()
    print(f"{C.PINK}{C.BOLD}╔{'═' * 58}╗{C.RESET}")
    print(f"{C.PINK}{C.BOLD}║{'  💌  ТВОИ ССЫЛКИ  💌'.center(58)}║{C.RESET}")
    print(f"{C.PINK}{C.BOLD}╠{'═' * 58}╣{C.RESET}")

    # Публичная — самая важная, выводим крупно
    if public_url:
        print(f"{C.PINK}{C.BOLD}║{' ' * 58}║{C.RESET}")
        print(f"{C.GREEN}{C.BOLD}║{'  📱 ОТПРАВЬ ЕЙ ЭТУ ССЫЛКУ:'.ljust(58)}║{C.RESET}")
        print(f"{C.GREEN}{C.BOLD}║{' ' * 58}║{C.RESET}")
        print(f"{C.GREEN}{C.BOLD}║  {public_url.ljust(56)}║{C.RESET}")
        print(f"{C.PINK}{C.BOLD}║{' ' * 58}║{C.RESET}")
        print(f"{C.PINK}{C.BOLD}╠{'─' * 58}╣{C.RESET}")
    else:
        print(f"{C.YELLOW}║{'  ⚠ Публичная ссылка не создана'.ljust(58)}║{C.RESET}")
        print(f"{C.YELLOW}║{'  Используй локальную сеть (ниже)'.ljust(58)}║{C.RESET}")
        print(f"{C.PINK}{C.BOLD}╠{'─' * 58}╣{C.RESET}")

    # Локальные
    print(f"{C.PINK}║{C.RESET}{'  💻 Для тебя (локально):'.ljust(58)}{C.PINK}║{C.RESET}")
    print(f"{C.PINK}║{C.RESET}{C.CYAN}{('    ' + local_url).ljust(58)}{C.PINK}║{C.RESET}")
    print(f"{C.PINK}║{' ' * 58}║{C.RESET}")
    print(f"{C.PINK}║{C.RESET}{'  📶 С телефона (в той же Wi-Fi):'.ljust(58)}{C.PINK}║{C.RESET}")
    print(f"{C.PINK}║{C.RESET}{C.CYAN}{('    ' + lan_url).ljust(58)}{C.PINK}║{C.RESET}")

    print(f"{C.PINK}{C.BOLD}╠{'─' * 58}╣{C.RESET}")
    print(f"{C.PINK}║{C.RESET}{'  📝 Ответ сохранится в:'.ljust(58)}{C.PINK}║{C.RESET}")
    print(f"{C.PINK}║{C.RESET}{C.BOLD}{('    ' + str(Path(MEET_FILE).resolve())).ljust(58)}{C.PINK}║{C.RESET}")
    print(f"{C.PINK}{C.BOLD}╠{'─' * 58}╣{C.RESET}")
    print(f"{C.PINK}║{C.RESET}{C.YELLOW}{'  ⏹  Остановить: Ctrl + C'.ljust(58)}{C.PINK}║{C.RESET}")
    print(f"{C.PINK}{C.BOLD}╚{'═' * 58}╝{C.RESET}")
    print()

    if public_url:
        print(f"{C.PURPLE}💡 Ссылка живёт, пока это окно открыто.{C.RESET}")
        print(f"{C.PURPLE}   Закроешь — туннель остановится.{C.RESET}")
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

    global PORT
    PORT = find_free_port(PORT)
    local_url = f"http://localhost:{PORT}"
    lan_ip = get_local_ip()
    lan_url = f"http://{lan_ip}:{PORT}"

    # Информация о файле ответов
    if Path(MEET_FILE).exists():
        try:
            with open(MEET_FILE, "r", encoding="utf-8") as f:
                existing = json.load(f)
                count = len(existing) if isinstance(existing, list) else 1
                print(f"{C.YELLOW}📋 В {MEET_FILE} уже {count} ответ(а){C.RESET}")
        except Exception:
            pass

    # Запуск сервера в фоне
    server_thread = threading.Thread(
        target=run_server,
        args=(PORT,),
        daemon=True,
    )
    server_thread.start()

    # Небольшая пауза, чтобы сервер поднялся
    time.sleep(0.5)

    # Автооткрытие браузера
    if AUTO_OPEN:
        threading.Thread(
            target=lambda: (time.sleep(0.3), webbrowser.open(local_url)),
            daemon=True,
        ).start()

    # Запуск Cloudflare Tunnel
    public_url = None
    if USE_TUNNEL:
        public_url = start_tunnel(PORT)

    # 🎉 Красивая финальная плашка
    print_links(local_url, lan_url, public_url)

    # Ждём Ctrl+C
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print(f"\n{C.PINK}💕 Сервер остановлен. До встречи!{C.RESET}\n")


def run_server(port):
    """Запускает HTTP-сервер (в отдельном потоке)."""
    with socketserver.TCPServer((HOST, port), Handler) as httpd:
        httpd.serve_forever()


if __name__ == "__main__":
    main()
