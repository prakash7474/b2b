"""
Precision tests for vendor inventory, batch lifecycle, and restock workflows.

Uses the FakeMongo harness to verify exact query + payload correctness
for every MongoDB write, eliminating the false-positive problem of MagicMock.
"""

import unittest
from datetime import datetime, timezone

import pytest
from tests.conftest import (
    flask_app,
    assert_inserted,
    assert_updated,
    assert_not_updated,
    assert_movement,
    assert_no_movement,
    AssertionErrorDetail,
)

app = flask_app.app
auth_serializer = flask_app.auth_serializer
ADMIN_USER = flask_app.ADMIN_USER
ADMIN_PASS = flask_app.ADMIN_PASS


# ═══════════════════════════════════════════════════════════════════════════
# 1. VENDOR INVENTORY UPDATE / STOCKOUT
# ═══════════════════════════════════════════════════════════════════════════


class TestVendorInventoryUpdate:
    """Precise payload-level tests for PUT /api/vendor/inventory/update."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"}
        )
        self.headers = {"Authorization": f"Bearer {self.vendor_token}"}

    def test_update_inventory_writes_exact_payload(self, fake_mongo, vendors, inventory, inventory_movement, logs):
        """Inventory $set must write remaining quantity + last_updated timestamp."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"})
        inventory.insert_one({
            "vendor_id": "V100", "quantity": 15.0, "minimumStock": 5.0, "product_name": "Idli Batter",
        })

        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100", "remaining_quantity_kg": 3.0},
            headers=self.headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True
        assert data["remaining_quantity_kg"] == 3.0
        assert data["previous_quantity_kg"] == 15.0

        # Verify the exact $set payload written to inventory
        result = assert_updated(
            inventory,
            {"vendor_id": "V100"},
            quantity=3.0,
        )
        assert "last_updated" in result["update"]["$set"]

    def test_update_inventory_below_minimum_flag(self, fake_mongo, vendors, inventory, inventory_movement, logs):
        """When remaining < minimumStock, response must flag below_minimum."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        inventory.insert_one({
            "vendor_id": "V100", "quantity": 15.0, "minimumStock": 10.0, "product_name": "Idli Batter",
        })

        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100", "remaining_quantity_kg": 3.0},
            headers=self.headers,
        )
        data = res.get_json()
        assert data["below_minimum"] is True
        assert data["minimum_stock_kg"] == 10.0

    def test_update_inventory_above_minimum_no_flag(self, fake_mongo, vendors, inventory, inventory_movement, logs):
        """When remaining >= minimumStock, below_minimum must be False."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        inventory.insert_one({
            "vendor_id": "V100", "quantity": 15.0, "minimumStock": 5.0, "product_name": "Idli Batter",
        })

        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100", "remaining_quantity_kg": 7.0},
            headers=self.headers,
        )
        data = res.get_json()
        assert data["below_minimum"] is False

    def test_update_inventory_insert_when_no_doc(self, fake_mongo, vendors, inventory, inventory_movement, logs):
        """When no inventory doc exists, insert_one creates a new record with defaults."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        # inventory is empty

        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100", "remaining_quantity_kg": 8.0},
            headers=self.headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True

        doc = assert_inserted(
            inventory,
            vendor_id="V100",
            quantity=8.0,
            minimumStock=5.0,
            product_name="Idli Batter",
        )
        assert doc["inventory_id"] == "INV_V100"

    def test_stockout_zero_transitions_batches(self, fake_mongo, vendors, inventory, batches, inventory_movement, logs):
        """When remaining=0, update_many must target ONLY status=received batches."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        inventory.insert_one({
            "vendor_id": "V100", "quantity": 15.0, "minimumStock": 5.0, "product_name": "Idli Batter",
        })
        batches.insert_one({"batch_id": "B1", "vendor_id": "V100", "status": "received", "volume_kg": 15.0})
        batches.insert_one({"batch_id": "B2", "vendor_id": "V100", "status": "assigned", "volume_kg": 10.0})

        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100", "remaining_quantity_kg": 0.0},
            headers=self.headers,
        )
        assert res.status_code == 200
        assert res.get_json()["is_stockout"] is True

        # update_many must target only "received" batches (not "assigned")
        result = assert_updated(
            batches,
            {"vendor_id": "V100", "status": "received"},
            op="update_many",
            status="stockout",
        )
        assert "stocked_out_at" in result["update"]["$set"]
        assert result["update"]["$set"]["remaining_volume_kg"] == 0.0

        # Verify B2 (assigned) was NOT touched
        b2 = batches.find_one({"batch_id": "B2"})
        assert b2["status"] == "assigned"

    def test_stockout_emits_negative_movement(self, fake_mongo, vendors, inventory, batches, inventory_movement, logs):
        """Stockout writes a negative-quantity movement to the ledger."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        inventory.insert_one({
            "vendor_id": "V100", "quantity": 15.0, "minimumStock": 5.0, "product_name": "Idli Batter",
        })
        batches.insert_one({"batch_id": "B1", "vendor_id": "V100", "status": "received", "volume_kg": 15.0})

        self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100", "remaining_quantity_kg": 0.0},
            headers=self.headers,
        )

        assert_movement(
            inventory_movement,
            movement_type="vendor_update",
            vendor_id="V100",
            quantity=-15.0,
            previous_qty=15.0,
            new_qty=0.0,
        )

    def test_vendor_update_missing_vendor_returns_404(self, fake_mongo):
        """Missing vendor must return 404 before touching any collection."""
        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V_NONEXISTENT", "remaining_quantity_kg": 5.0},
            headers=self.headers,
        )
        assert res.status_code == 404

    def test_vendor_update_missing_field_returns_400(self, fake_mongo):
        """Missing required fields must return 400."""
        res = self.client.put(
            "/api/vendor/inventory/update",
            json={"vendor_id": "V100"},
            headers=self.headers,
        )
        assert res.status_code == 400


# ═══════════════════════════════════════════════════════════════════════════
# 2. BATCH RECEIVE / ASSIGN / STOCKOUT
# ═══════════════════════════════════════════════════════════════════════════


class TestBatchReceive:
    """Precise payload-level tests for PUT /api/batches/<id>/receive."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        self.vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Lakshmi"}
        )
        self.vendor_headers = {"Authorization": f"Bearer {self.vendor_token}"}

    def test_receive_sets_status_received(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """Batch receive must update status to 'received' with timestamps."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "assigned", "volume_kg": 20.0,
            "product_name": "Idli Batter", "batch_number": "B1",
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 0.0})

        res = self.client.put(
            "/api/batches/B1/receive",
            json={"notes": "Delivered on time"},
            headers=self.vendor_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True
        assert data["status"] == "received"

        result = assert_updated(
            batches,
            {"batch_id": "B1"},
            status="received",
        )
        assert "received_at" in result["update"]["$set"]
        assert result["update"]["$set"]["received_notes"] == "Delivered on time"

    def test_receive_syncs_inventory(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """After receive, sync_vendor_inventory_with_batches must update inventory to batch volume."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "assigned", "volume_kg": 20.0,
            "product_name": "Idli Batter", "batch_number": "B1",
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 0.0})

        self.client.put(
            "/api/batches/B1/receive",
            json={},
            headers=self.vendor_headers,
        )

        # sync_vendor_inventory_with_batches runs, finds B1 (now received), sets quantity to 20.0
        # Query may use {"_id": ...} or {"vendor_id": ...} depending on code path,
        # so we verify the $set payload without constraining the query.
        result = assert_updated(
            inventory,
            None,
            quantity=20.0,
        )
        assert "batch_number" in result["update"]["$set"]

    def test_receive_emits_receive_movement(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """Batch receive must write a 'receive' movement event with positive quantity."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "assigned", "volume_kg": 20.0,
            "product_name": "Idli Batter", "batch_number": "B1",
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 0.0})

        self.client.put(
            "/api/batches/B1/receive",
            json={},
            headers=self.vendor_headers,
        )

        assert_movement(
            inventory_movement,
            movement_type="receive",
            vendor_id="V100",
            quantity=20.0,
            batch_id="B1",
            previous_qty=0.0,
        )

    def test_receive_missing_batch_returns_404(self, fake_mongo):
        """Missing batch must return 404."""
        res = self.client.put(
            "/api/batches/B_NONEXISTENT/receive",
            json={},
            headers=self.vendor_headers,
        )
        assert res.status_code == 404


class TestBatchStockout:
    """Precise payload-level tests for POST /api/batches/<id>/stockout."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Lakshmi"}
        )
        self.vendor_headers = {"Authorization": f"Bearer {self.vendor_token}"}

    def test_stockout_archives_with_correct_fields(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """Batch stockout must $set status=archived, archived_reason=vendor_stockout, remaining_volume_kg=0."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "received", "volume_kg": 15.0,
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 15.0})

        res = self.client.post(
            "/api/batches/B1/stockout",
            json={"reason": "Sold out"},
            headers=self.vendor_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True
        assert data["status"] == "archived"

        result = assert_updated(
            batches,
            {"batch_id": "B1"},
            status="archived",
        )
        assert result["update"]["$set"]["archived_reason"] == "vendor_stockout"
        assert result["update"]["$set"]["remaining_volume_kg"] == 0.0
        assert "archived_at" in result["update"]["$set"]

    def test_stockout_deducts_from_inventory(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """Stockout must reduce inventory by batch volume."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "received", "volume_kg": 15.0,
        })
        batches.insert_one({
            "batch_id": "B2", "vendor_id": "V100", "status": "received", "volume_kg": 10.0,
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 25.0})

        self.client.post(
            "/api/batches/B1/stockout",
            json={},
            headers=self.vendor_headers,
        )

        # B2 is still received, so inventory should be 25-15=10
        result = assert_updated(
            inventory,
            {"vendor_id": "V100"},
            quantity=10.0,
        )
        assert "last_updated" in result["update"]["$set"]

    def test_stockout_with_no_remaining_sets_zero(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """When stockout removes the last batch, inventory must be set to 0."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "received", "volume_kg": 15.0,
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 15.0})

        self.client.post(
            "/api/batches/B1/stockout",
            json={},
            headers=self.vendor_headers,
        )

        assert_updated(inventory, {"vendor_id": "V100"}, quantity=0.0)

    def test_stockout_emits_negative_movement(self, fake_mongo, batches, vendors, inventory, inventory_movement, logs):
        """Stockout must write a movement event with negative quantity."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({
            "batch_id": "B1", "vendor_id": "V100", "status": "received", "volume_kg": 15.0,
        })
        inventory.insert_one({"vendor_id": "V100", "quantity": 15.0})

        self.client.post(
            "/api/batches/B1/stockout",
            json={},
            headers=self.vendor_headers,
        )

        assert_movement(
            inventory_movement,
            movement_type="stockout",
            vendor_id="V100",
            quantity=-15.0,
            batch_id="B1",
        )


class TestBatchAssign:
    """Precise payload-level tests for PUT /api/batches/<id>/assign."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

    def test_assign_writes_exact_fields(self, fake_mongo, batches, vendors, inventory_movement, logs, restock_requests, orders):
        """Assign must $set vendor_id, status=assigned, assigned_at and $push assignment_log."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({"batch_id": "B1", "status": "created", "vendor_id": None})

        res = self.client.put(
            "/api/batches/B1/assign",
            json={"vendor_id": "V100"},
            headers=self.admin_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True
        assert data["archived_count"] == 0

        result = assert_updated(
            batches,
            {"batch_id": "B1"},
            vendor_id="V100",
            status="assigned",
        )
        assert "assigned_at" in result["update"]["$set"]
        assert "assignment_log" in result["update"].get("$push", {})

    def test_assign_does_not_touch_other_batches(self, fake_mongo, batches, vendors, inventory_movement, logs, restock_requests, orders):
        """Assign must NOT archive existing batches."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        batches.insert_one({"batch_id": "B_NEW", "status": "created"})
        batches.insert_one({"batch_id": "B_OLD", "vendor_id": "V100", "status": "received", "volume_kg": 15.0})

        self.client.put(
            "/api/batches/B_NEW/assign",
            json={"vendor_id": "V100"},
            headers=self.admin_headers,
        )

        # B_OLD should still be received
        b_old = batches.find_one({"batch_id": "B_OLD"})
        assert b_old["status"] == "received"

        # Verify update_many was NOT called on batches
        assert not batches.was_called("update_many") or not any(
            args[0].get("vendor_id") == "V100" and args[1].get("$set", {}).get("status") == "archived"
            for args, _ in batches.calls_for("update_many")
        )

    def test_assign_missing_batch_returns_404(self, fake_mongo, vendors):
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        res = self.client.put(
            "/api/batches/B_MISSING/assign",
            json={"vendor_id": "V100"},
            headers=self.admin_headers,
        )
        assert res.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════
# 3. RESTOCK REQUEST / APPROVAL WORKFLOW
# ═══════════════════════════════════════════════════════════════════════════


class TestRestockRequestCreate:
    """Precise payload-level tests for POST /api/restock-requests."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.vendor_token = auth_serializer.dumps(
            {"role": "vendor", "vendor_id": "V100", "shop_name": "Lakshmi"}
        )
        self.vendor_headers = {"Authorization": f"Bearer {self.vendor_token}"}

    def test_create_restock_cross_links_order(self, fake_mongo, vendors, inventory, restock_requests, orders, logs):
        """Creating a restock must insert both restock_request + order, then link them."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        inventory.insert_one({"vendor_id": "V100", "quantity": 2.0})

        res = self.client.post(
            "/api/restock-requests",
            json={
                "vendor_id": "V100",
                "product_name": "Idli Batter",
                "requested_quantity_kg": 20.0,
                "notes": "Low stock",
            },
            headers=self.vendor_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True
        assert "request_id" in data
        assert "order_id" in data

        # Verify restock_request was inserted
        rr = assert_inserted(restock_requests, vendor_id="V100", product_name="Idli Batter")
        assert rr["requested_quantity_kg"] == 20.0
        assert rr["status"] == "pending"

        # Verify order was inserted
        od = assert_inserted(orders, vendor_id="V100", product_name="Idli Batter")
        assert od["order_status"] == "pending_admin_approval"
        assert od["restock_request_id"] == rr["request_id"]
        assert od["quantity_kg"] == 20.0

        # Verify back-link via the update that sets linked_order_id (not via inserted doc)
        result = assert_updated(
            restock_requests,
            {"request_id": rr["request_id"]},
            linked_order_id=od["order_id"],
        )
        assert result is not None

    def test_create_restock_captures_current_stock(self, fake_mongo, vendors, inventory, restock_requests, orders, logs):
        """restock_request.current_stock_kg must reflect the snapshot at creation time."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        inventory.insert_one({"vendor_id": "V100", "quantity": 3.0})

        res = self.client.post(
            "/api/restock-requests",
            json={"vendor_id": "V100", "requested_quantity_kg": 20.0},
            headers=self.vendor_headers,
        )
        data = res.get_json()
        assert data["ok"] is True

        rr = assert_inserted(restock_requests, vendor_id="V100")
        assert rr["current_stock_kg"] == 3.0

    def test_create_restock_missing_vendor_returns_404(self, fake_mongo):
        res = self.client.post(
            "/api/restock-requests",
            json={"vendor_id": "V_MISSING"},
            headers=self.vendor_headers,
        )
        assert res.status_code == 404


class TestRestockApprove:
    """Precise payload-level tests for PATCH /api/restock-requests/<id>/approve."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

    def test_approve_updates_status_and_order(self, fake_mongo, restock_requests, orders, vendors, batches, inventory_movement, logs):
        """Approve must set restock_request.status=approved AND order.order_status=approved."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        rr = restock_requests.insert_one({
            "request_id": "RSR_001", "vendor_id": "V100", "status": "pending",
            "linked_order_id": "ORD_001", "product_name": "Idli Batter",
            "requested_quantity_kg": 20.0, "current_stock_kg": 2.0,
        })
        orders.insert_one({
            "order_id": "ORD_001", "vendor_id": "V100",
            "order_status": "pending_admin_approval", "restock_request_id": "RSR_001",
        })

        res = self.client.patch(
            "/api/restock-requests/RSR_001/approve",
            json={"admin_notes": "Approved"},
            headers=self.admin_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True

        # Verify restock_request status set to approved
        assert_updated(
            restock_requests,
            {"request_id": "RSR_001"},
            status="approved",
        )

        # Verify order_status set to approved
        assert_updated(
            orders,
            {"order_id": "ORD_001"},
            order_status="approved",
        )

    def test_approve_missing_request_returns_404(self, fake_mongo, vendors):
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        res = self.client.patch(
            "/api/restock-requests/RSR_MISSING/approve",
            json={},
            headers=self.admin_headers,
        )
        assert res.status_code == 404


class TestRestockReject:
    """Precise payload-level tests for PATCH /api/restock-requests/<id>/reject."""

    def setup_method(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        self.admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}

    def test_reject_updates_status_and_order(self, fake_mongo, restock_requests, orders, vendors, logs):
        """Reject must set restock_request.status=rejected AND order.order_status=rejected."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        restock_requests.insert_one({
            "request_id": "RSR_001", "vendor_id": "V100", "status": "pending",
            "linked_order_id": "ORD_001",
        })
        orders.insert_one({
            "order_id": "ORD_001", "vendor_id": "V100",
            "order_status": "pending_admin_approval",
        })

        res = self.client.patch(
            "/api/restock-requests/RSR_001/reject",
            json={"reason": "Capacity full"},
            headers=self.admin_headers,
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["ok"] is True

        # Verify restock_request status set to rejected
        assert_updated(
            restock_requests,
            {"request_id": "RSR_001"},
            status="rejected",
        )

        # Verify order_status set to rejected
        assert_updated(
            orders,
            {"order_id": "ORD_001"},
            order_status="rejected",
        )

    def test_reject_stores_admin_notes(self, fake_mongo, restock_requests, orders, vendors, logs):
        """Reject must persist the admin's reason in admin_notes."""
        vendors.insert_one({"vendor_id": "V100", "shop_name": "Lakshmi"})
        restock_requests.insert_one({
            "request_id": "RSR_001", "vendor_id": "V100", "status": "pending",
            "linked_order_id": "ORD_001",
        })
        orders.insert_one({"order_id": "ORD_001", "vendor_id": "V100", "order_status": "pending_admin_approval"})

        self.client.patch(
            "/api/restock-requests/RSR_001/reject",
            json={"reason": "Supplier on leave"},
            headers=self.admin_headers,
        )

        assert_updated(
            restock_requests,
            {"request_id": "RSR_001"},
            admin_notes="Supplier on leave",
        )


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
