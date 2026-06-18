#!/usr/bin/env python3
"""Best-effort commit + push of the private data files to a separate backup repo.

Requires PRIVATE_DATA_REPO to be set in .env (e.g., git@github.com:your/private-data.git).
If not set, it silently exits, keeping your data strictly local.
Only data files are synced. One commit per call.

Usage: python3 scripts/autosync.py "reason for the sync"
"""
import os
import subprocess
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data", "private")
PATHS = ["advice-log.json", "portfolio.json", "LEARNINGS.md"]

def get_env(key):
    v = os.environ.get(key)
    if v is not None: return v
    try:
        with open(os.path.join(ROOT, ".env")) as f:
            for line in f:
                k, _, val = line.partition("=")
                if k.replace("export", "").strip() == key:
                    return val.strip().strip("\"'")
    except OSError:
        pass
    return None

def git(*args, cwd=DATA_DIR):
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)

def main():
    if get_env("DEMO_MODE") == "1":
        return
        
    private_repo = get_env("PRIVATE_DATA_REPO")
    if not private_repo:
        return  # Silently keep data local if no private repo is configured.
        
    reason = sys.argv[1] if len(sys.argv) > 1 else "data update"
    
    # Ensure data dir exists
    os.makedirs(DATA_DIR, exist_ok=True)
    
    
    # Initialize separate git repo if it doesn't exist
    if not os.path.exists(os.path.join(DATA_DIR, ".git")):
        git("init")
        git("remote", "add", "origin", private_repo)
        git("branch", "-M", "main")
    
    present = [p for p in PATHS if os.path.exists(os.path.join(DATA_DIR, p))]
    if not present:
        return
        
    git("add", "--", *present)
    if git("diff", "--cached", "--quiet").returncode == 0:
        return  # nothing changed
        
    msg = f"chore(data): {reason} ({datetime.now().strftime('%Y-%m-%d %H:%M')})"
    if git("commit", "-m", msg).returncode != 0:
        print("autosync: commit failed", file=sys.stderr)
        return
        
    push = git("push", "-u", "origin", "main")
    if push.returncode != 0:
        print(f"autosync: committed locally, push failed (offline?): {push.stderr.strip()[-200:]}", file=sys.stderr)
    else:
        print(f"autosync: {msg}")

if __name__ == "__main__":
    main()
