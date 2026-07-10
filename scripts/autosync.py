#!/usr/bin/env python3
"""Best-effort commit + push of the private data files to a separate backup repo.

Requires PRIVATE_DATA_REPO to be set in .env (e.g., git@github.com:your/private-data.git).
If not set, it silently exits, keeping your data strictly local.
Only data files are synced. One commit per call.

Usage: python3 scripts/autosync.py "reason for the sync"
"""
from __future__ import annotations

import logging
import os
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data", "private")
PATHS = ["advice-log.json", "portfolio.json", "REVIEWS.md", "eod.md", "news.md", "STRATEGY.md", "equity-history.json", "correlation.json"]

os.makedirs(os.path.join(ROOT, "logs"), exist_ok=True)
logging.basicConfig(
    filename=os.path.join(ROOT, "logs", "app.log"),
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("autosync")


class AutoSync:
    def __init__(self, data_dir: str = DATA_DIR, paths: list[str] | None = None) -> None:
        self.data_dir = data_dir
        self.paths = paths if paths is not None else PATHS

    def get_env(self, key: str) -> str | None:
        v = os.environ.get(key)
        if v is not None:
            return v
        try:
            with open(os.path.join(ROOT, ".env")) as f:
                for line in f:
                    k, _, val = line.partition("=")
                    if k.replace("export", "").strip() == key:
                        return val.strip().strip("\"'")
        except OSError:
            pass
        return None

    def git(self, *args: str, cwd: str | None = None) -> subprocess.CompletedProcess:
        if cwd is None:
            cwd = self.data_dir
        return subprocess.run(["git", *args], cwd=cwd,
                              capture_output=True, text=True)

    def sync(self, reason: str = "data update") -> None:
        if self.get_env("DEMO_MODE") == "1":
            return

        try:
            subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "record_equity.py")], cwd=ROOT)
        except Exception as e:
            logger.warning("Failed to record equity: %s", e)

        private_repo = self.get_env("PRIVATE_DATA_REPO")
        if not private_repo:
            # Silently keep data local if no private repo is configured.
            return

        os.makedirs(self.data_dir, exist_ok=True)

        if not os.path.exists(os.path.join(self.data_dir, ".git")):
            self.git("init")
            self.git("remote", "add", "origin", private_repo)
            self.git("branch", "-M", "main")

        present = [
            p for p in self.paths if os.path.exists(
                os.path.join(
                    self.data_dir, p))]
        if not present:
            return

        self.git("add", "--", *present)
        if self.git("diff", "--cached", "--quiet").returncode == 0:
            return  # nothing changed

        import nyse
        msg = f"chore(data): {reason} ({nyse.nyse_now().isoformat('T', 'minutes')})"
        if self.git("commit", "-m", msg).returncode != 0:
            logger.error("autosync: commit failed")
            return

        push = self.git("push", "-u", "origin", "main")
        if push.returncode != 0:
            logger.error(
                f"autosync: committed locally, push failed (offline?): {push.stderr.strip()[-200:]}")
        else:
            logger.info(f"autosync: {msg}")


def main():
    reason = sys.argv[1] if len(sys.argv) > 1 else "data update"
    syncer = AutoSync()
    syncer.sync(reason)


if __name__ == "__main__":
    main()
