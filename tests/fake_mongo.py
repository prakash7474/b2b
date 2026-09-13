"""
Lightweight in-memory Mongo emulator for unit tests.

Replaces MagicMock'd collections with a stateful store that executes real
find/update/insert/delete logic against Python dicts, and records every call
so tests can assert exact query + payload correctness.

Supports: $or, $in, $ne, $exists, $gt/$gte/$lt/$lte, $set, $push, $inc,
          find().sort().limit() cursor chain, upsert, count_documents.
"""

from __future__ import annotations

import copy
import datetime
from dataclasses import dataclass, field
from typing import Any


# ── Query matching ────────────────────────────────────────────────────────


def match(doc: dict, flt: dict | None) -> bool:
    """Return True if *doc* satisfies a MongoDB-style *flt*."""
    if not flt:
        return True
    for key, condition in flt.items():
        if key == "$or":
            if not any(match(doc, sub) for sub in condition):
                return False
            continue

        val = doc.get(key)

        if isinstance(condition, dict):
            for op, expected in condition.items():
                if op == "$in":
                    if val not in expected:
                        return False
                elif op == "$ne":
                    if val == expected:
                        return False
                elif op == "$exists":
                    exists = val is not None
                    if exists != expected:
                        return False
                elif op == "$gt":
                    if val is None or val <= expected:
                        return False
                elif op == "$gte":
                    if val is None or val < expected:
                        return False
                elif op == "$lt":
                    if val is None or val >= expected:
                        return False
                elif op == "$lte":
                    if val is None or val > expected:
                        return False
                # Unknown operator — permissive (treat as pass)
        else:
            if val != condition:
                return False
    return True


def apply_update(doc: dict, update: dict) -> dict:
    """Apply a MongoDB-style update to a document, returning the new version."""
    new_doc = dict(doc)
    if "$set" in update:
        new_doc.update(update["$set"])
    if "$push" in update:
        for fld, val in update["$push"].items():
            new_doc.setdefault(fld, []).append(val)
    if "$inc" in update:
        for fld, val in update["$inc"].items():
            new_doc[fld] = new_doc.get(fld, 0) + val
    return new_doc


# ── Result objects ─────────────────────────────────────────────────────────


@dataclass
class InsertResult:
    inserted_id: Any = None


@dataclass
class UpdateResult:
    matched_count: int = 0
    upserted_id: Any = None


@dataclass
class DeleteResult:
    deleted_count: int = 0


# ── Cursor ─────────────────────────────────────────────────────────────────


class FakeCursor:
    """Mimics a PyMongo cursor with .sort() and .limit() chaining."""

    def __init__(self, docs: list[dict]):
        self._docs = list(docs)

    def sort(self, key_or_list, direction=None) -> "FakeCursor":
        if isinstance(key_or_list, list):
            key = key_or_list[0][0]
            reverse = key_or_list[0][1] < 0
        elif isinstance(key_or_list, str):
            key = key_or_list
            reverse = direction is not None and direction < 0
        else:
            key = key_or_list
            reverse = False

        def sort_key(d):
            val = d.get(key)
            if val is None:
                return (0,)
            return (1, val)

        self._docs.sort(key=sort_key, reverse=reverse)
        return self

    def limit(self, n: int) -> "FakeCursor":
        self._docs = self._docs[:n]
        return self

    def __iter__(self):
        return iter(self._docs)

    def __len__(self):
        return len(self._docs)

    def __getitem__(self, index):
        return self._docs[index]

    def __bool__(self):
        return bool(self._docs)

    def to_list(self) -> list[dict]:
        return list(self._docs)


# ── Collection ─────────────────────────────────────────────────────────────


class FakeCollection:
    """An in-memory collection that mirrors the relevant PyMongo subset."""

    def __init__(self, name: str = ""):
        self.name = name
        self._docs: list[dict] = []
        self._calls: list[tuple[str, tuple, dict]] = []

    # -- recording helpers ---------------------------------------------------

    def _record(self, op: str, *args, **kwargs):
        self._calls.append((op, args, kwargs))

    def clear(self):
        """Erase all stored documents AND call history."""
        self._docs.clear()
        self._calls.clear()

    # -- read operations -----------------------------------------------------

    def find_one(self, filter=None, **kwargs):
        self._record("find_one", filter, **kwargs)
        for doc in self._docs:
            if match(doc, filter or {}):
                return dict(doc)
        return None

    def find(self, filter=None, projection=None):
        self._record("find", filter, projection)
        results = [dict(d) for d in self._docs if match(d, filter or {})]
        return FakeCursor(results)

    def count_documents(self, filter):
        self._record("count_documents", filter)
        return sum(1 for d in self._docs if match(d, filter or {}))

    # -- write operations ----------------------------------------------------

    def insert_one(self, doc):
        self._record("insert_one", doc)
        new_doc = copy.deepcopy(doc)
        if "_id" not in new_doc:
            new_doc["_id"] = f"fake_id_{len(self._docs) + 1}"
        self._docs.append(new_doc)
        return InsertResult(new_doc["_id"])

    def insert_many(self, docs, ordered=True):
        self._record("insert_many", docs, ordered=ordered)
        ids = []
        for doc in docs:
            r = self.insert_one(doc)
            ids.append(r.inserted_id)
        return InsertResult(ids)

    def update_one(self, filter, update, upsert=False):
        self._record("update_one", filter, update, upsert=upsert)
        for i, doc in enumerate(self._docs):
            if match(doc, filter or {}):
                self._docs[i] = apply_update(doc, update)
                return UpdateResult(1)
        if upsert:
            new_doc = apply_update(filter or {}, update)
            if "_id" not in new_doc:
                new_doc["_id"] = f"fake_id_{len(self._docs) + 1}"
            self._docs.append(new_doc)
            return UpdateResult(1, new_doc["_id"])
        return UpdateResult(0)

    def update_many(self, filter, update):
        self._record("update_many", filter, update)
        matched = 0
        for i, doc in enumerate(self._docs):
            if match(doc, filter or {}):
                self._docs[i] = apply_update(doc, update)
                matched += 1
        return UpdateResult(matched)

    def delete_one(self, filter):
        self._record("delete_one", filter)
        for i, doc in enumerate(self._docs):
            if match(doc, filter or {}):
                del self._docs[i]
                return DeleteResult(1)
        return DeleteResult(0)

    def delete_many(self, filter):
        self._record("delete_many", filter)
        kept = []
        removed = 0
        for doc in self._docs:
            if match(doc, filter or {}):
                removed += 1
            else:
                kept.append(doc)
        self._docs = kept
        return DeleteResult(removed)

    def create_index(self, keys, **kwargs):
        pass  # no-op for tests

    # -- inspection helpers --------------------------------------------------

    @property
    def call_history(self) -> list[tuple[str, tuple, dict]]:
        return list(self._calls)

    def calls_for(self, op: str) -> list[tuple[tuple, dict]]:
        return [(args, kw) for (o, args, kw) in self._calls if o == op]

    def was_called(self, op: str) -> bool:
        return any(o == op for (o, _, _) in self._calls)

    def reset_calls(self):
        self._calls.clear()


# ── FakeMongo (COLS replacement) ──────────────────────────────────────────


class FakeMongo(dict):
    """A dict of FakeCollections that replaces flask_app.COLS.

    Usage in tests::

        fm = FakeMongo(["vendors", "inventory", "batches", "logs"])
        with patch.dict(flask_app.COLS, fm):
            ...
    """

    def __init__(self, names=()):
        super().__init__()
        self._collections: dict[str, FakeCollection] = {}
        for name in names:
            self.add(name)

    def add(self, name: str) -> FakeCollection:
        col = FakeCollection(name)
        self._collections[name] = col
        self[name] = col
        return col

    def get_col(self, name: str) -> FakeCollection:
        return self._collections[name]

    def reset(self):
        for col in self._collections.values():
            col.clear()
