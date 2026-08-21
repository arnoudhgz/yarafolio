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
import json
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data", "private")
PATHS = ["advice-log.json", "portfolio.json", "REVIEWS.md", "eod.md", "news.md", "STRATEGY.md", "equity-history.json", "correlation.json", "custom_instruments.json"]

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
            with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
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
        env = os.environ.copy()
        env["GIT_AUTHOR_NAME"] = "YaraFolio AutoSync"
        env["GIT_AUTHOR_EMAIL"] = "autosync@yarafolio.local"
        env["GIT_COMMITTER_NAME"] = "YaraFolio AutoSync"
        env["GIT_COMMITTER_EMAIL"] = "autosync@yarafolio.local"
        return subprocess.run(["git", *args], cwd=cwd, env=env,
                              capture_output=True, text=True)

    def resolve_json_conflict(self, filepath: str) -> bool:
        """Attempts to smartly merge a conflicted JSON file by favoring the most recently updated version."""
        ours_res = self.git("show", f":2:{filepath}")
        theirs_res = self.git("show", f":3:{filepath}")
        
        if ours_res.returncode != 0 or theirs_res.returncode != 0:
            return False
            
        try:
            ours = json.loads(ours_res.stdout)
            theirs = json.loads(theirs_res.stdout)
        except json.JSONDecodeError:
            return False

        # Smart merge strategy:
        # Determine which one is newer based on lastUpdated
        ours_ts = ours.get("lastUpdated", "")
        theirs_ts = theirs.get("lastUpdated", "")
        
        is_theirs_newer = theirs_ts > ours_ts
        
        merged = {}
        if filepath == "advice-log.json":
            merged = ours.copy() if isinstance(ours, dict) else {}
            merged["lastUpdated"] = theirs_ts if is_theirs_newer else ours_ts
            
            def get_key(e):
                return e.get("id") or f"{e.get('ticker', '')}_{e.get('firstAdvised', '')}_{e.get('status', '')}"
                
            entries = {}
            for e in ours.get("entries", []):
                entries[get_key(e)] = e
            for e in theirs.get("entries", []):
                key = get_key(e)
                if key not in entries or is_theirs_newer:
                    entries[key] = e
            merged["entries"] = list(entries.values())
            
            for k in set(ours.keys() if isinstance(ours, dict) else []).union(theirs.keys() if isinstance(theirs, dict) else []):
                if k in ("lastUpdated", "entries"): continue
                if isinstance(ours.get(k, []), list) and isinstance(theirs.get(k, []), list):
                    seen = set()
                    uniq = []
                    for item in ours.get(k, []) + theirs.get(k, []):
                        rep = json.dumps(item, sort_keys=True) if isinstance(item, dict) else str(item)
                        if rep not in seen:
                            uniq.append(item)
                            seen.add(rep)
                    merged[k] = uniq
            
        elif filepath == "portfolio.json":
            merged["lastUpdated"] = theirs_ts if is_theirs_newer else ours_ts
            holdings = {}
            for h in ours.get("holdings", []):
                holdings[h.get("ticker")] = h
            for h in theirs.get("holdings", []):
                key = h.get("ticker")
                if key not in holdings or is_theirs_newer:
                    holdings[key] = h
            merged["totalInvested"] = sum(h.get("invested", 0) for h in holdings.values())
            merged["holdings"] = list(holdings.values())
            
        elif filepath == "equity-history.json":
            # For equity history, it's an array of data points. We can just union and deduplicate by timestamp.
            history = {}
            for pt in ours if isinstance(ours, list) else []:
                if "timestamp" in pt: history[pt["timestamp"]] = pt
            for pt in theirs if isinstance(theirs, list) else []:
                if "timestamp" in pt: history[pt["timestamp"]] = pt
            merged = sorted(list(history.values()), key=lambda x: x["timestamp"])
            
        else:
            # Fallback for other JSON files: just take the newer one entirely, or ours if we can't tell
            merged = theirs if is_theirs_newer else ours

        # Write resolved
        full_path = os.path.join(self.data_dir, filepath)
        with open(full_path, "w", encoding="utf-8") as f:
            if isinstance(merged, list):
                json.dump(merged, f)
            else:
                json.dump(merged, f, indent=2)
                f.write("\n")
        
        self.git("add", filepath)
        return True

    def sync(self, reason: str = "data update") -> None:
        if self.get_env("DEMO_MODE") == "1":
            return

        if self.get_env("STOCKS_AUTOSYNC") != "1":
            return

        if reason != "startup":
            try:
                subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "record_equity.py")], cwd=ROOT)
            except Exception as e:
                logger.warning("Failed to record equity: %s", e)

        private_repo = self.get_env("PRIVATE_DATA_REPO")
        if not private_repo:
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
        # 1. Commit local changes FIRST
        has_changes = False
        if present:
            self.git("add", "--", *present)
            has_changes = self.git("diff", "--cached", "--quiet").returncode != 0

        import nyse
        msg = f"chore(data): {reason} ({nyse.nyse_now().isoformat('T', 'minutes')})"

        if has_changes:
            if self.git("commit", "-m", msg).returncode != 0:
                logger.error("autosync: commit failed")
                return

        # 2. Pull remote changes with standard merge (not rebase) to allow automated conflict resolution
        pull = self.git("pull", "--no-rebase", "--no-edit", "origin", "main")
        
        if pull.returncode != 0:
            # Check if there are conflicted files
            status = self.git("ls-files", "-u")
            conflicted_files = set([line.split("\t")[1] for line in status.stdout.splitlines() if line])
            
            resolved_all = True
            for file in conflicted_files:
                if file.endswith(".json"):
                    if not self.resolve_json_conflict(file):
                        resolved_all = False
                else:
                    # For markdown files, favor ours
                    self.git("checkout", "--ours", file)
                    self.git("add", file)
            
            if resolved_all:
                # Finalize merge
                merge_commit = self.git("commit", "--no-edit")
                if merge_commit.returncode == 0:
                    logger.info("autosync: Automatically resolved merge conflicts.")
                else:
                    logger.error(f"autosync: Failed to finalize merge commit: {merge_commit.stderr}")
                    self.git("merge", "--abort")
                    return
            else:
                self.git("merge", "--abort")
                logger.error(f"autosync: pull failed due to conflicts that couldn't be auto-resolved. Merge aborted. Data safe locally.")
                return

        # 3. Push to remote
        push = self.git("push", "-u", "origin", "main")
        if push.returncode != 0:
            logger.error(
                f"autosync: committed locally, push failed (offline?): {push.stderr.strip()[-200:]}")
        elif has_changes or pull.returncode != 0:
            logger.info(f"autosync: {msg}")


def main():
    reason = sys.argv[1] if len(sys.argv) > 1 else "data update"
    syncer = AutoSync()
    syncer.sync(reason)


if __name__ == "__main__":
    main()
