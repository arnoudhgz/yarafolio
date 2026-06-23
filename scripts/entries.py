#!/usr/bin/env python3
"""Shared entry normalization for the advice tracker.

Legacy and partially-written entries can be missing structural fields. Normalizing
on load keeps readers from KeyError-ing on iteration/indexing of those fields.
"""

LIST_FIELDS = ("priceHistory", "notes", "lots")


def normalize_entry(e: dict) -> dict:
    """Ensure the structural list fields exist as lists. Mutates and returns ``e``."""
    for field in LIST_FIELDS:
        if not isinstance(e.get(field), list):
            e[field] = []
    return e


def normalize_entries(data: dict) -> dict:
    """Normalize every entry in a loaded advice-log dict. Returns ``data``."""
    for e in data.get("entries", []):
        normalize_entry(e)
    return data
