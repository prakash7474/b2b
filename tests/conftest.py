"""
Shared test infrastructure: loads app.py via importlib and exposes it
as ``flask_app`` so every test file can import consistent fixtures.
"""
import os
import sys
import importlib.util

# Ensure project root is on sys.path for module resolution
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

# Load app.py explicitly to avoid collision with the app/ package
_app_path = os.path.abspath(os.path.join(_project_root, "app.py"))
_spec = importlib.util.spec_from_file_location("flask_app", _app_path)
flask_app = importlib.util.module_from_spec(_spec)
sys.modules["flask_app"] = flask_app
_spec.loader.exec_module(flask_app)

app = flask_app.app
auth_serializer = flask_app.auth_serializer
ADMIN_USER = flask_app.ADMIN_USER
ADMIN_PASS = flask_app.ADMIN_PASS


# ── FakeMongo helpers for precise (non-MagicMock) assertions ──────────
class FakeCollection:
    """In-memory list that mimics the subset of PyMongo we need."""

    def __init__(self, name: str):
        self.name = name
        self._docs: list[dict] = []
        self._inserted: list[dict] = []
        self._updates: list[tuple[dict, dict]] = []
        self._method_calls: list[str] = []

    # ── reads ──────────────────────────────────────────────────────
    def find(self, query=None, projection=None):
        self._method_calls.append("find")
        q = query or {}
        return [d for d in self._docs if _match(d, q)]

    def find_one(self, query=None, projection=None):
        self._method_calls.append("find_one")
        q = query or {}
        for d in self._docs:
            if _match(d, q):
                return d
        return None

    def count_documents(self, query=None):
        self._method_calls.append("count_documents")
        return len(self.find(query))

    def aggregate(self, pipeline):
        self._method_calls.append("aggregate")
        # Minimal support for $group
        return []

    # ── writes ─────────────────────────────────────────────────────
    def insert_one(self, doc):
        self._method_calls.append("insert_one")
        self._inserted.append(doc)
        self._docs.append(doc)
        return _InsertResult(doc)

    def insert_many(self, docs):
        self._method_calls.append("insert_many")
        for d in docs:
            self.insert_one(d)

    def update_one(self, query, update, upsert=False):
        self._method_calls.append("update_one")
        doc = self.find_one(query)
        if doc:
            _apply_update(doc, update)
            self._updates.append(("update_one", query, update))
            return _UpdateResult(matched=1, modified=1)
        if upsert:
            new_doc = dict(query)
            _apply_update(new_doc, update)
            self.insert_one(new_doc)
            self._updates.append(("update_one_upsert", query, update))
            return _UpdateResult(matched=0, modified=0, upserted_id=new_doc.get("_id"))
        self._updates.append(("update_one", query, update))
        return _UpdateResult(matched=0, modified=0)

    def update_many(self, query, update):
        self._method_calls.append("update_many")
        count = 0
        for d in self._docs:
            if _match(d, query):
                _apply_update(d, update)
                count += 1
        self._updates.append(("update_many", query, update))
        return _UpdateResult(matched=count, modified=count)

    def delete_one(self, query):
        self._method_calls.append("delete_one")
        for i, d in enumerate(self._docs):
            if _match(d, query):
                self._docs.pop(i)
                return _DeleteResult(deleted_count=1)
        return _DeleteResult(deleted_count=0)

    def was_called(self, method_name):
        """Check if a method was called."""
        return method_name in self._method_calls

    def sort(self, *args, **kwargs):
        return self

    def limit(self, n):
        return self._docs[:n]


class _InsertResult:
    def __init__(self, doc):
        self.inserted_id = doc.get("_id", id(doc))


class _UpdateResult:
    def __init__(self, matched=0, modified=0, upserted_id=None):
        self.matched_count = matched
        self.modified_count = modified
        self.upserted_id = upserted_id


class _DeleteResult:
    def __init__(self, deleted_count=0):
        self.deleted_count = deleted_count


def _match(doc: dict, query: dict) -> bool:
    for k, v in query.items():
        if k == "$or":
            if not any(_match(doc, sub) for sub in v):
                return False
            continue
        if k == "$expr":
            continue  # skip $expr for simplicity
        doc_val = doc.get(k)
        if isinstance(v, dict):
            if "$in" in v and doc_val not in v["$in"]:
                return False
            if "$gte" in v and (doc_val is None or doc_val < v["$gte"]):
                return False
            if "$lte" in v and (doc_val is None or doc_val > v["$lte"]):
                return False
            if "$nin" in v and doc_val in v["$nin"]:
                return False
            if "$exists" in v:
                exists = doc_val is not None
                if v["$exists"] != exists:
                    return False
            if "$ne" in v and doc_val == v["$ne"]:
                return False
        else:
            if doc_val != v:
                return False
    return True


def _apply_update(doc: dict, update: dict):
    if "$set" in update:
        doc.update(update["$set"])
    if "$push" in update:
        for k, v in update["$push"].items():
            doc.setdefault(k, []).append(v)
    if "$inc" in update:
        for k, v in update["$inc"].items():
            doc[k] = doc.get(k, 0) + v


def _make_fake_cols(*names):
    return {name: FakeCollection(name) for name in names}


# ── pytest fixtures ─────────────────────────────────────────────────────
import pytest

COLLECTION_NAMES = [
    "vendors", "inventory", "batches", "inventory_movement",
    "logs", "orders", "order_items", "restock_requests",
    "weather_forecast", "festival_calendar", "predictions",
    "feature_snapshots", "products",
]


@pytest.fixture
def fake_mongo():
    """Replace backend.database.COLS with FakeCollections for the duration of a test."""
    import backend.database as _db
    cols = _make_fake_cols(*COLLECTION_NAMES)
    original = _db.COLS
    _db.COLS = cols
    flask_app.COLS = cols
    yield cols
    _db.COLS = original
    flask_app.COLS = original


@pytest.fixture
def vendors(fake_mongo):
    return fake_mongo["vendors"]


@pytest.fixture
def inventory(fake_mongo):
    return fake_mongo["inventory"]


@pytest.fixture
def batches(fake_mongo):
    return fake_mongo["batches"]


@pytest.fixture
def inventory_movement(fake_mongo):
    return fake_mongo["inventory_movement"]


@pytest.fixture
def logs(fake_mongo):
    return fake_mongo["logs"]


@pytest.fixture
def orders(fake_mongo):
    return fake_mongo["orders"]


@pytest.fixture
def restock_requests(fake_mongo):
    return fake_mongo["restock_requests"]


@pytest.fixture
def predictions(fake_mongo):
    return fake_mongo["predictions"]


# ── assertion helpers ─────────────────────────────────────────────────
class AssertionErrorDetail(Exception):
    pass


def assert_inserted(col: FakeCollection, predicate=None, msg="no matching insert", **kwargs):
    """Find an inserted doc matching predicate(doc), a query dict, or all **kwargs items."""
    def _check(doc):
        if predicate is not None:
            if callable(predicate):
                if not predicate(doc):
                    return False
            elif isinstance(predicate, dict):
                if not all(doc.get(k) == v for k, v in predicate.items()):
                    return False
        if kwargs:
            return all(doc.get(k) == v for k, v in kwargs.items())
        return True
    for doc in col._inserted:
        if _check(doc):
            return doc
    raise AssertionErrorDetail(msg)


def assert_updated(col: FakeCollection, predicate=None, msg="no matching update", **kwargs):
    """Find an update matching predicate(q, u), a query dict, or **kwargs in the $set update.
    Returns a dict with keys: op, query, update.
    """
    # Separate 'op' from other kwargs
    expected_op = kwargs.pop("op", None)
    
    def _check(op, q, u):
        if expected_op and op != expected_op:
            return False
        if predicate is not None:
            if callable(predicate):
                if not predicate(q, u):
                    return False
            elif isinstance(predicate, dict):
                if not all(q.get(k) == v for k, v in predicate.items()):
                    return False
        set_vals = u.get("$set", {})
        if kwargs:
            return all(set_vals.get(k) == v for k, v in kwargs.items())
        return True
    for entry in col._updates:
        if len(entry) == 3:
            op, q, u = entry
        else:
            op = "unknown"
            q, u = entry
        if _check(op, q, u):
            return {"op": op, "query": q, "update": u}
    raise AssertionErrorDetail(msg)


def assert_not_updated(col: FakeCollection, predicate, msg="unexpected update found"):
    for entry in col._updates:
        if len(entry) == 3:
            _, q, u = entry
        else:
            q, u = entry
        if predicate(q, u):
            raise AssertionErrorDetail(msg)


def assert_movement(col: FakeCollection, vendor_id=None, movement_type=None, msg="no matching movement", **kwargs):
    """Find a movement doc matching vendor_id, movement_type, and any extra **kwargs.
    Checks both 'movementType' (camelCase from write_movement) and 'movement_type'.
    Also checks nested metadata and camelCase variants of kwargs.
    """
    def _to_camel(snake):
        parts = snake.split("_")
        return parts[0] + "".join(w.capitalize() for w in parts[1:])

    def _check(doc):
        if vendor_id and doc.get("vendorId") != vendor_id:
            return False
        if movement_type:
            if doc.get("movementType") != movement_type and doc.get("movement_type") != movement_type:
                return False
        for k, v in kwargs.items():
            camel_key = _to_camel(k)
            if doc.get(k) == v or doc.get(camel_key) == v:
                continue
            meta = doc.get("metadata", {})
            if meta.get(k) == v or meta.get(camel_key) == v:
                continue
            return False
        return True
    for doc in col._inserted:
        if _check(doc):
            return doc
    raise AssertionErrorDetail(msg)


def assert_no_movement(col: FakeCollection, vendor_id, movement_type, msg="unexpected movement"):
    for doc in col._inserted:
        if doc.get("vendorId") == vendor_id and doc.get("movement_type") == movement_type:
            raise AssertionErrorDetail(msg)
