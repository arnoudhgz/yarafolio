#!/usr/bin/env python3
"""Serve the stock advice dashboard with save and import support.

Usage:
  python3 yarafolio.py [port]
  python3 yarafolio.py --stop

Opens http://127.0.0.1:8742/dashboard.html in the browser.
POST /api/save    - dashboard buttons write data/advice-log.json
POST /api/import  - runs scripts/etoro_import.py preview + merge (the "Update
                    from eToro" button)
POST /api/refresh - scrapes live quotes for advised watching/bought tickers via
                    screen.py and writes them through advice_log.py touch-many
                    (the "Refresh quotes" button)
GET  /api/stats   - review_stats.py --json passthrough (the Analytics tab)
Stdlib only, no dependencies. Ctrl+C to stop.
"""
import logging
import json
import os
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from datetime import datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(ROOT, "scripts"))


def get_env(key):
    v = os.environ.get(key)
    if v is not None:
        return v
    try:
        with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
            for line in f:
                k, _, val = line.partition("=")
                if k.replace("export", "").strip() == key:
                    return val.strip().strip("\"'")
    except OSError:
        pass
    return None


is_demo = get_env("DEMO_MODE") == "1"
subdir = "sample" if is_demo else "private"
DATA_FILE = os.path.join(ROOT, "data", subdir, "advice-log.json")
IMPORT_SCRIPT = os.path.join(ROOT, "scripts", "etoro_import.py")
SCREEN_SCRIPT = os.path.join(ROOT, "scripts", "screen.py")
ADVICE_LOG_SCRIPT = os.path.join(ROOT, "scripts", "advice_log.py")
LEARN_SCRIPT = os.path.join(ROOT, "scripts", "review_stats.py")
AUTOSYNC_SCRIPT = os.path.join(ROOT, "scripts", "autosync.py")
PID_FILE = os.path.join(ROOT, "tmp", "serve.pid")
DEFAULT_PORT = int(get_env("PORT") or 8742)

# guards advice-log.json writes (save, merge, refresh)
DATA_LOCK = threading.Lock()
IMPORT_RUNNING = threading.Lock()   # non-blocking guard against double imports
REFRESH_RUNNING = threading.Lock()  # non-blocking guard against double refreshes
VERSION_INFO = {"local": "unknown", "remote": "unknown"}
SYNC_LOCK = threading.Lock()        # serialises background git autosyncs
ACTIVE_LOCATION = None



def autosync(reason):
    """Fire-and-forget data backup; no-op unless STOCKS_AUTOSYNC=1. Never blocks the response."""
    def worker():
        with SYNC_LOCK:
            try:
                subprocess.run([sys.executable, AUTOSYNC_SCRIPT,
                               reason], cwd=ROOT, timeout=60)
            except Exception:
                pass
    threading.Thread(target=worker, daemon=True).start()


def is_refreshable_quote(quote, market_today):
    """Accept any quote with a valid price. The scraper fetches the latest available (avoids weekend/date-parsing rejects)."""
    return isinstance(quote, dict) and isinstance(quote.get("price"), (int, float))


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


    def do_POST(self):
        if self.path == "/api/save":
            self.handle_save()
        elif self.path == "/api/import":
            self.handle_import()
        elif self.path == "/api/refresh":
            self.handle_refresh()
        else:
            self.send_error(404)

    def do_GET(self):
        if self.path in ("/data/advice-log.json", "/data/portfolio.json", "/data/eod.md", "/data/news.md", "/data/REVIEWS.md", "/data/equity-history.json", "/data/custom_instruments.json"):
            self.path = self.path.replace("/data/", f"/data/{subdir}/")

        if self.path == f"/data/{subdir}/custom_instruments.json":
            data = {}
            base_path = os.path.join(ROOT, "data", "instruments.json")
            cache_path = os.path.join(ROOT, "data", subdir, "custom_instruments.json")
            if os.path.exists(base_path):
                with open(base_path, encoding="utf-8") as f:
                    try: data.update(json.load(f))
                    except: pass
            if os.path.exists(cache_path):
                with open(cache_path, encoding="utf-8") as f:
                    try: data.update(json.load(f))
                    except: pass
            self.respond_json(200, data)
            return

        if self.path == "/api/status":
            self.respond_json(
                200, {
                    "ok": True, "pid": os.getpid(), "root": ROOT})
        elif self.path == "/api/stats":
            self.handle_stats()
        elif self.path == "/api/history":
            history_file = os.path.join(ROOT, "data", subdir, "history.json")
            if os.path.exists(history_file):
                with open(history_file, encoding="utf-8") as f:
                    try:
                        data = json.load(f)
                    except:
                        data = []
            else:
                data = []
            self.respond_json(200, data)

        elif self.path.startswith("/api/news"):
            self.handle_news()
        elif self.path.startswith("/api/macro"):
            self.handle_macro()
        elif self.path.startswith("/api/agent_run"):
            self.handle_agent_run()
        elif self.path == "/api/ipos" or self.path.startswith("/api/ipos?"):
            force = "force=1" in self.path
            import time
            cache_file = os.path.join(ROOT, "data", "ipos_cache.json")
            if os.path.exists(cache_file) and not force:
                age = time.time() - os.path.getmtime(cache_file)
                if age < 4 * 3600:
                    with open(cache_file, encoding="utf-8") as f:
                        self.respond_json(200, json.load(f))
                        return
            try:
                res = subprocess.run([sys.executable,
                                      os.path.join(ROOT,
                                                   "scripts",
                                                   "screen.py"),
                                      "ipos",
                                      "--json"],
                                     capture_output=True,
                                     text=True,
                                     check=True)
                with open(cache_file, "w", encoding="utf-8") as f:
                    f.write(res.stdout)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(res.stdout.encode())
            except subprocess.CalledProcessError as e:
                self.respond_json(500, {"error": e.stderr})
        elif self.path == "/api/locations":
            self.handle_locations()
        elif self.path == "/api/version":
            self.respond_json(200, VERSION_INFO)
            return
        else:
            super().do_GET()

    def respond_json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_save(self):
        if is_demo:
            self.respond_json(200, {"ok": True})
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            data = json.loads(self.rfile.read(length))
            if not isinstance(
                    data, dict) or not isinstance(
                    data.get("entries"), list):
                raise ValueError("expected {lastUpdated, entries: []}")
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_error(400, str(exc))
            return
        tmp = DATA_FILE + ".tmp"
        with DATA_LOCK:
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2)
                f.write("\n")
            os.replace(tmp, DATA_FILE)
        autosync("dashboard edit")
        self.respond_json(200, {"ok": True})

    def handle_import(self):
        if is_demo:
            self.respond_json(200,
                              {"ok": True,
                               "preview": "Demo mode: import simulated",
                               "merge": "Demo mode: merge simulated",
                               "demo": True})
            return
        length = int(self.headers.get("Content-Length", 0))
        location = ""
        if length > 0:
            try:
                body = json.loads(self.rfile.read(length))
                location = body.get("location", "")
            except (ValueError, json.JSONDecodeError):
                pass

        if not IMPORT_RUNNING.acquire(blocking=False):
            self.respond_json(
                409, {
                    "ok": False, "error": "import already running"})
            return
        try:
            results = {}
            for step in ("preview", "merge"):
                lock = DATA_LOCK if step == "merge" else None
                if lock:
                    lock.acquire()
                try:
                    env = os.environ.copy()
                    if location:
                        env["ETORO_SUFFIX"] = location
                    proc = subprocess.run(
                        [sys.executable, IMPORT_SCRIPT, step],
                        capture_output=True, text=True, timeout=120, cwd=ROOT, env=env)
                except subprocess.TimeoutExpired:
                    self.respond_json(504, {"ok": False, "step": step,
                                            "error": "timed out after 120s"})
                    return
                finally:
                    if lock:
                        lock.release()
                if proc.returncode != 0:
                    self.respond_json(502,
                                      {"ok": False,
                                       "step": step,
                                       "output": proc.stdout.strip(),
                                          "error": proc.stderr.strip()[-500:]})
                    return
                results[step] = proc.stdout.strip()
            autosync("eToro import")
            self.respond_json(200, {"ok": True, "preview": results["preview"],
                                    "merge": results["merge"]})
        finally:
            IMPORT_RUNNING.release()

    def handle_refresh(self):
        if is_demo:
            self.respond_json(200, {"ok": True, "demo": True})
            return
        # Refresh reads tickers + writes from disk, not the browser's in-memory state, so
        # any unsaved browser edits would be lost. In practice the dashboard saves on every
        # action, so there are none. The touch-many write is the only step that
        # holds DATA_LOCK.
        if not REFRESH_RUNNING.acquire(blocking=False):
            self.respond_json(
                409, {
                    "ok": False, "error": "refresh already running"})
            return
        try:
            try:
                with open(DATA_FILE, encoding="utf-8") as f:
                    entries = json.load(f).get("entries", [])
            except (OSError, ValueError) as exc:
                self.respond_json(
                    500, {
                        "ok": False, "error": f"could not read log: {exc}"})
                return
            # import holdings get their prices from the eToro sync, not from
            # scraping
            tickers = list({e["ticker"] for e in entries if e.get("source") != "import"
                            and e.get("status") in ("watching", "dropped")})
            if not tickers:
                self.respond_json(
                    200, {
                        "ok": True, "refreshed": 0, "note": "nothing to refresh"})
                return
            # slow network scrape: must NOT hold DATA_LOCK (would block
            # dashboard saves)
            try:
                proc = subprocess.run(
                    [sys.executable, SCREEN_SCRIPT, "quote", "--json", *tickers],
                    capture_output=True, text=True, timeout=90, cwd=ROOT)
            except subprocess.TimeoutExpired:
                self.respond_json(
                    504, {
                        "ok": False, "step": "quote", "error": "timed out after 90s"})
                return
            if proc.returncode != 0:
                self.respond_json(502, {"ok": False, "step": "quote",
                                        "error": proc.stderr.strip()[-500:]})
                return
            try:
                quotes = json.loads(proc.stdout)
            except json.JSONDecodeError as exc:
                self.respond_json(502, {"ok": False, "step": "quote",
                                        "error": f"bad quote json: {exc}"})
                return
            import nyse
            market_today = nyse.nyse_today().isoformat()
            price_map = {t: {"price": q["price"], "earningsDate": q.get("Earnings Date")}
                         for t, q in quotes.items()
                         if is_refreshable_quote(q, market_today)}
            skipped = [t for t in tickers if t not in price_map]
            if not price_map:
                self.respond_json(200,
                                  {"ok": True,
                                   "refreshed": 0,
                                   "skipped": skipped,
                                   "note": "no live prices parsed"})
                return
            with DATA_LOCK:
                try:
                    wp = subprocess.run(
                        [sys.executable, ADVICE_LOG_SCRIPT, "touch-many"],
                        input=json.dumps(price_map), capture_output=True, text=True,
                        timeout=30, cwd=ROOT)
                except subprocess.TimeoutExpired:
                    self.respond_json(504, {"ok": False, "step": "write",
                                            "error": "timed out after 30s"})
                    return
            if wp.returncode != 0:
                self.respond_json(502, {"ok": False, "step": "write",
                                        "error": wp.stderr.strip()[-500:]})
                return
            autosync("quote refresh")
            sessions = {}
            for ticker in price_map:
                session = quotes[ticker].get("session", "unknown")
                sessions[session] = sessions.get(session, 0) + 1
            self.respond_json(200, {"ok": True, "refreshed": len(price_map),
                                    "skipped": skipped, "sessions": sessions,
                                    "output": wp.stdout.strip()})
        finally:
            REFRESH_RUNNING.release()

    def handle_stats(self):
        if is_demo:
            try:
                with open(os.path.join(ROOT, "data", "sample", "review-stats.json"), encoding="utf-8") as f:
                    self.respond_json(200, json.load(f))
                return
            except OSError:
                pass # Fallback to running the script if file missing

        try:
            cmd = [sys.executable, LEARN_SCRIPT, "--json"]
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30,
                cwd=ROOT)
        except subprocess.TimeoutExpired:
            self.respond_json(
                504, {
                    "ok": False, "error": "learn_stats timed out"})
            return
        if proc.returncode != 0:
            self.respond_json(
                502, {"ok": False, "error": proc.stderr.strip()[-500:]})
            return
        body = proc.stdout.encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_news(self):
        from urllib.parse import urlparse, parse_qs
        qs = parse_qs(urlparse(self.path).query)
        tickers = qs.get("tickers", [""])[0].split(",")
        tickers = [t.strip().upper() for t in tickers if t.strip()]
        if not tickers:
            self.respond_json(
                400, {
                    "ok": False, "error": "No tickers provided"})
            return

        try:
            proc = subprocess.run(
                [sys.executable, SCREEN_SCRIPT, "news", "--json", *tickers[:45]],
                capture_output=True, text=True, timeout=60, cwd=ROOT)
        except subprocess.TimeoutExpired:
            self.respond_json(
                504, {
                    "ok": False, "error": "timed out fetching news"})
            return

        if proc.returncode != 0:
            self.respond_json(
                502, {"ok": False, "error": proc.stderr.strip()[-500:]})
            return

        try:
            news_data = json.loads(proc.stdout)
            self.respond_json(200, {"ok": True, "news": news_data})
        except json.JSONDecodeError:
            self.respond_json(
                502, {
                    "ok": False, "error": "failed to parse news JSON"})

    def handle_macro(self):
        import urllib.request
        import re
        import os
        import time

        force = "force=1" in self.path
        cache_file = os.path.join(ROOT, "data", "macro_cache.json")
        try:
            if os.path.exists(cache_file) and not force:
                cache_time = os.path.getmtime(cache_file)
                age = time.time() - cache_time
                if age < 2 * 3600:
                    with open(cache_file, encoding="utf-8") as f:
                        cached_events = json.load(f)
                    
                    import datetime
                    now_ts = time.time()
                    event_passed = False
                    for ev in cached_events:
                        if not ev.get("time") or ev["time"] in ("All Day", "Tentative"):
                            continue
                        try:
                            dt_naive = datetime.datetime.strptime(f"{ev['date']} {ev['time']}", "%m-%d-%Y %I:%M%p")
                            m, d = dt_naive.month, dt_naive.day
                            dst = (3 < m < 11) or (m == 3 and d > 14) or (m == 11 and d < 7)
                            ev_ts = (dt_naive - datetime.timedelta(hours=-4 if dst else -5)).replace(tzinfo=datetime.timezone.utc).timestamp()
                            
                            if cache_time <= ev_ts <= now_ts:
                                event_passed = True
                                break
                        except Exception:
                            pass
                    
                    if not event_passed:
                        return self.respond_json(
                            200, {"ok": True, "events": cached_events, "cached": True})

            req = urllib.request.Request(
                "https://nfs.faireconomy.media/ff_calendar_thisweek.xml",
                headers={'User-Agent': 'Mozilla/5.0'}
            )
            with urllib.request.urlopen(req, timeout=15) as response:
                xml_data = response.read().decode('utf-8', errors='ignore')

            events = []
            for event_match in re.finditer(
                    r'<event>(.*?)</event>', xml_data, re.DOTALL):
                event_str = event_match.group(1)
                event = {}
                for key in [
                    'title',
                    'country',
                    'date',
                    'time',
                    'impact',
                    'forecast',
                    'previous',
                    'actual']:
                    m = re.search(
                        fr'<{key}>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</{key}>',
                        event_str,
                        re.DOTALL)
                    event[key] = m.group(1).strip() if m else ''
                events.append(event)

            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(events, f)

            self.respond_json(200, {"ok": True, "events": events})
        except Exception as exc:
            if os.path.exists(cache_file):
                with open(cache_file, encoding="utf-8") as f:
                    return self.respond_json(
                        200, {"ok": True, "events": json.load(f), "cached": True, "stale": True})
            self.respond_json(500, {"ok": False, "error": str(exc)})

    def handle_agent_run(self):
        if is_demo:
            self.respond_json(
                200, {
                    "ok": True, "stdout": "Demo mode: agent run simulated", "stderr": ""})
            return
        from urllib.parse import urlparse, parse_qs
        import shlex
        qs = parse_qs(urlparse(self.path).query)
        cmd = qs.get("cmd", [""])[0]
        args_str = qs.get("args", [""])[0]
        if not cmd:
            self.respond_json(400, {"ok": False, "error": "missing cmd"})
            return

        args_list = shlex.split(args_str)
        try:
            proc = subprocess.run([sys.executable,
                                   ADVICE_LOG_SCRIPT,
                                   cmd] + args_list,
                                  capture_output=True,
                                  text=True,
                                  timeout=30,
                                  cwd=ROOT)
            if proc.returncode == 0:
                autosync(f"agent {cmd}")
            self.respond_json(200,
                              {"ok": proc.returncode == 0,
                               "stdout": proc.stdout,
                               "stderr": proc.stderr})
        except Exception as e:
            self.respond_json(500, {"ok": False, "error": str(e)})

    def handle_locations(self):
        env_file = os.path.join(ROOT, ".env")
        suffixes = []
        try:
            with open(env_file, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("#"):
                        continue
                    if line.startswith("ETORO_USER_KEY_"):
                        suffix = line.split("=")[0].replace(
                            "export ", "").replace(
                            "ETORO_USER_KEY_", "").strip()
                        if suffix and suffix.lower() != "default":
                            suffixes.append(suffix)
        except OSError:
            pass
        self.respond_json(200, {"prefixes": sorted(list(set(suffixes))), "active": ACTIVE_LOCATION})

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # keep the terminal quiet


os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
logger = logging.getLogger("serve")
logger.setLevel(logging.INFO)
logger.handlers = []

fh = logging.FileHandler(os.path.join(ROOT, "logs", "app.log"))
fh.setFormatter(logging.Formatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(fh)

ch = logging.StreamHandler(sys.stdout)
ch.setFormatter(logging.Formatter('%(message)s'))
logger.addHandler(ch)


class YaraFolioApp:
    def read_pid(self):
        try:
            with open(PID_FILE, encoding="utf-8") as f:
                return int(f.read().strip())
        except (OSError, ValueError):
            return None

    def process_exists(self, pid):
        try:
            os.kill(pid, 0)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            return True
        except OSError:
            return False

    def stop_server(self):
        pid = self.read_pid()
        if not pid or not self.process_exists(pid):
            try:
                os.unlink(PID_FILE)
            except FileNotFoundError:
                pass
            logger.info("YaraFolio is not running (no active PID file).")
            return False
        os.kill(pid, signal.SIGTERM)
        for _ in range(50):
            if not self.process_exists(pid):
                logger.info(f"Stopped YaraFolio process {pid}.")
                return True
            time.sleep(0.1)
        sys.exit(f"YaraFolio process {pid} did not stop within 5 seconds.")

    def parse_args(self):
        args = sys.argv[1:]
        stop = "--stop" in args
        restart = "--restart" in args
        unknown = [arg for arg in args if arg.startswith(
            "--") and arg not in ("--stop", "--restart")]
        if unknown:
            sys.exit(f"Unknown option: {unknown[0]}")
        ports = [arg for arg in args if not arg.startswith("--")]
        if len(ports) > 1:
            sys.exit("Usage: python3 yarafolio.py [--stop] [port]")
        try:
            port = int(ports[0]) if ports else DEFAULT_PORT
        except ValueError:
            sys.exit(f"Invalid port: {ports[0]}")
        return stop, restart, port

    def main(self):
        stop, restart, port = self.parse_args()
        if stop:
            self.stop_server()
            return

        # Always attempt to stop any existing instance before starting
        self.stop_server()

        os.makedirs(os.path.dirname(PID_FILE), exist_ok=True)
        os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
        try:
            server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
        except OSError as exc:
            if exc.errno == 48:
                sys.exit(
                    f"Port {port} is already in use by another application. "
                    "Please choose another port by setting PORT=... in your .env file.")
            raise

        with open(PID_FILE, "w", encoding="utf-8") as f:
            f.write(f"{os.getpid()}\n")

        def request_shutdown(_signum, _frame):
            threading.Thread(target=server.shutdown, daemon=True).start()

        signal.signal(signal.SIGTERM, request_shutdown)
        url = f"http://127.0.0.1:{port}/dashboard.html"

        def initial_sync():
            import urllib.request, urllib.error, json, re
            
            # 0. Check versions
            try:
                with open(os.path.join(ROOT, "CHANGELOG.md")) as f:
                    for line in f:
                        if line.startswith("## [") and "Unreleased" not in line:
                            VERSION_INFO["local"] = line.split("[")[1].split("]")[0]
                            break
            except Exception: pass
            try:
                req = urllib.request.Request("https://api.github.com/repos/arnoudhgz/yarafolio/releases/latest")
                req.add_header("User-Agent", "YaraFolio")
                with urllib.request.urlopen(req, timeout=5) as res:
                    data = json.loads(res.read().decode())
                    tag = data.get("tag_name", "")
                    if tag.startswith("v"):
                        tag = tag[1:]
                    VERSION_INFO["remote"] = tag
            except Exception: pass
            
            locations = []
            try:
                with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
                    content = f.read()
                    for m in re.finditer(r"ETORO_USER_KEY_([A-Z0-9_]+)=", content):
                        suffix = m.group(1)
                        if suffix not in locations and suffix.lower() != "default":
                            locations.append(suffix)
            except OSError: pass
            if not locations:
                locations = [""]

            # 0.5. Sync data (pulls from git if empty)
            try:
                import subprocess
                subprocess.run([sys.executable, AUTOSYNC_SCRIPT, "startup"], cwd=ROOT)
            except Exception as e:
                logger.error(f"Initial git sync failed: {e}")

            # 1. Refresh quotes
            try:
                req = urllib.request.Request(f"http://127.0.0.1:{port}/api/refresh", data=b"{}")
                req.add_header("Content-Type", "application/json")
                urllib.request.urlopen(req, timeout=120)
            except urllib.error.HTTPError as e:
                try:
                    err_body = json.loads(e.read().decode())
                    err_msg = err_body.get("error", "").strip().split('\n')[-1]
                    if err_msg: logger.info(f"Initial refresh sync skipped: {err_msg}")
                except Exception: pass
            except Exception: pass

            # 2. Import from eToro (try locations until one succeeds)
            for loc in locations:
                try:
                    payload = json.dumps({"location": loc}).encode()
                    req = urllib.request.Request(f"http://127.0.0.1:{port}/api/import", data=payload)
                    req.add_header("Content-Type", "application/json")
                    res = urllib.request.urlopen(req, timeout=120)
                    if res.status == 200:
                        global ACTIVE_LOCATION
                        ACTIVE_LOCATION = loc
                        break  # Success, stop trying other locations
                except urllib.error.HTTPError as e:
                    try:
                        err_body = json.loads(e.read().decode())
                        err_msg = err_body.get("error", "").strip().split('\n')[-1]
                        if err_msg:
                            loc_name = loc if loc else "default"
                            logger.info(f"Initial import sync (location '{loc_name}') skipped: {err_msg}")
                    except Exception: pass
                except Exception: pass

            logger.info("Initial sync complete. Opening dashboard...")
            webbrowser.open(url)

        threading.Thread(target=initial_sync, daemon=True).start()

        logger.info(f"YaraFolio on {url} (Ctrl+C to stop)")
        logger.info("Running initial sync, dashboard will open shortly...")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            logger.info("")
        finally:
            server.server_close()
            if self.read_pid() == os.getpid():
                os.unlink(PID_FILE)
            logger.info("Stopped.")


if __name__ == "__main__":
    app = YaraFolioApp()
    app.main()
