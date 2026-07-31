#!/usr/bin/env python3
"""Merge private instrument cache into public instruments list.

Reads data/private/instruments_cache.json (and sample if it exists) and
merges new entries or updates into data/instruments.json.
This allows contributing community mappings back to the open source project
without dirtying the git status during daily use.

Usage: python3 scripts/publish_instruments.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE_FILE = os.path.join(ROOT, "data", "instruments.json")
CACHE_PRIVATE = os.path.join(ROOT, "data", "private", "instruments_cache.json")
CACHE_SAMPLE = os.path.join(ROOT, "data", "sample", "instruments_cache.json")

def load_json(path):
    if not os.path.exists(path):
        return {}
    with open(path, "r") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)

def main():
    print(f"Reading {BASE_FILE}...")
    base_data = load_json(BASE_FILE)
    original_len = len(base_data)

    print("Merging caches...")
    for cache_path in [CACHE_PRIVATE, CACHE_SAMPLE]:
        if os.path.exists(cache_path):
            cache_data = load_json(cache_path)
            for iid, record in cache_data.items():
                if iid not in base_data:
                    base_data[iid] = record
                else:
                    base_data[iid].update(record)
    
    new_len = len(base_data)
    save_json(BASE_FILE, base_data)
    print(f"Merged {new_len - original_len} new entries. Total entries: {new_len}.")
    print("You can now safely commit data/instruments.json!")

if __name__ == "__main__":
    main()
