"""
Unit tests for Vendor Inventory Management, Restock Request/Approval Workflow,
Batch Archiving on Assignment, and ML Spoilage Risk Model Isolation.
"""

import unittest
import os
import importlib.util
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock

# Load root app.py explicitly
app_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app.py"))
spec = importlib.util.spec_from_file_location("flask_app", app_path)
flask_app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(flask_app)

app = flask_app.app
auth_serializer = flask_app.auth_serializer
ADMIN_USER = flask_app.ADMIN_USER
ADMIN_PASS = flask_app.ADMIN_PASS


class TestVendorWorkflow(unittest.TestCase):
    """Test suite for vendor stock update, restock requests, batch assignment & archiving."""

    def setUp(self):
        self.client = app.test_client()
        app.config["TESTING"] = True
        # Admin auth header
        admin_token = auth_serializer.dumps({"role": "admin", "username": ADMIN_USER})
        self.admin_headers = {"Authorization": f"Bearer {admin_token}"}
        # Vendor auth header
        vendor_token = auth_serializer.dumps({"role": "vendor", "vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"})
        self.vendor_headers = {"Authorization": f"Bearer {vendor_token}"}

    def test_vendor_inventory_update(self):
        """Vendor can update inventory from 15kg to 3kg."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = {"vendor_id": vendor_id, "quantity": 15.0, "minimumStock": 5.0, "product_name": "Idli Batter"}

        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find_one.return_value = mock_inv

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.put(
                "/api/vendor/inventory/update",
                json={"vendor_id": vendor_id, "remaining_quantity_kg": 3.0},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("previous_quantity_kg"), 15.0)
            self.assertEqual(data.get("remaining_quantity_kg"), 3.0)
            self.assertTrue(data.get("below_minimum"))
            self.assertFalse(data.get("is_stockout"))
            mock_cols["inventory"].update_one.assert_called_once()

    def test_vendor_inventory_depleted_to_zero(self):
        """When stock reaches 0, batches transition to stockout and stockout flag is set."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = {"vendor_id": vendor_id, "quantity": 3.0, "minimumStock": 5.0, "product_name": "Idli Batter"}

        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find_one.return_value = mock_inv

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.put(
                "/api/vendor/inventory/update",
                json={"vendor_id": vendor_id, "remaining_quantity_kg": 0.0},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertTrue(data.get("is_stockout"))
            mock_cols["batches"].update_many.assert_called_once()

    def test_create_restock_request(self):
        """Vendor can request another batch after stock update."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = {"vendor_id": vendor_id, "quantity": 2.0}

        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find_one.return_value = mock_inv

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.post(
                "/api/restock-requests",
                json={
                    "vendor_id": vendor_id,
                    "product_name": "Idli Batter",
                    "requested_quantity_kg": 20.0,
                    "notes": "Running low, morning rush approaching",
                },
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertIn("request_id", data)
            self.assertIn("order_id", data)
            mock_cols["restock_requests"].insert_one.assert_called_once()
            mock_cols["orders"].insert_one.assert_called_once()

    def test_admin_approve_restock_request(self):
        """Admin can approve a pending restock request."""
        req_id = "RSR_V100_12345"
        mock_req = {
            "request_id": req_id,
            "vendor_id": "V100",
            "product_name": "Idli Batter",
            "requested_quantity_kg": 20.0,
            "status": "pending",
            "linked_order_id": "ORD_V100_12345",
        }
        mock_vendor = {"vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"}

        mock_cols = {
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "vendors": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["restock_requests"].find_one.side_effect = [
            mock_req,
            {**mock_req, "status": "approved"},
        ]
        mock_cols["vendors"].find_one.return_value = mock_vendor

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.patch(
                f"/api/restock-requests/{req_id}/approve",
                json={"admin_notes": "Approved for 6 AM dispatch"},
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            mock_cols["restock_requests"].update_one.assert_called_once()
            mock_cols["orders"].update_one.assert_called_once()

    def test_admin_reject_restock_request(self):
        """Admin can reject a restock request with reason."""
        req_id = "RSR_V100_12345"
        mock_req = {
            "request_id": req_id,
            "vendor_id": "V100",
            "status": "pending",
            "linked_order_id": "ORD_V100_12345",
        }
        mock_vendor = {"vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"}

        mock_cols = {
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "vendors": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["restock_requests"].find_one.side_effect = [
            mock_req,
            {**mock_req, "status": "rejected"},
        ]
        mock_cols["vendors"].find_one.return_value = mock_vendor

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.patch(
                f"/api/restock-requests/{req_id}/reject",
                json={"reason": "Capacity full for today"},
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))

    def test_assign_batch_archives_old_received_batches(self):
        """Assigning a new batch to a vendor archives existing received batches."""
        batch_id = "B20020_NEW"
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        old_received_batch = {
            "batch_id": "B20010_OLD",
            "vendor_id": vendor_id,
            "status": "received",
            "volume_kg": 15.0,
            "product_name": "Idli Batter",
        }

        mock_cols = {
            "vendors": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["batches"].find.return_value = [old_received_batch]
        mock_cols["batches"].update_one.return_value.matched_count = 1

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.put(
                f"/api/batches/{batch_id}/assign",
                json={"vendor_id": vendor_id},
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("archived_count"), 1)
            mock_cols["batches"].update_many.assert_called_once()
            mock_cols["inventory_movement"].insert_one.assert_called()

    def test_receive_batch_resets_inventory(self):
        """Vendor confirming receipt resets inventory to new batch quantity."""
        batch_id = "B20020_NEW"
        vendor_id = "V100"
        mock_batch = {
            "batch_id": batch_id,
            "vendor_id": vendor_id,
            "volume_kg": 20.0,
            "product_name": "Idli Batter",
            "batch_number": "B20020_NEW",
        }
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_existing_inv = {"vendor_id": vendor_id, "quantity": 2.0}

        mock_cols = {
            "batches": MagicMock(),
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["batches"].find_one.return_value = mock_batch
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find_one.return_value = mock_existing_inv

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.put(
                f"/api/batches/{batch_id}/receive",
                json={"notes": "Received fresh batch"},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("status"), "received")
            call_args = mock_cols["inventory"].update_one.call_args
            set_doc = call_args[0][1]["$set"]
            self.assertEqual(set_doc["quantity"], 20.0)

    def test_batch_history_endpoint(self):
        """Batch history endpoint returns archived and stocked-out batches."""
        vendor_id = "V100"
        archived_batches = [
            {"batch_id": "B20001", "status": "archived", "created_at": datetime.utcnow()},
            {"batch_id": "B20002", "status": "stockout", "created_at": datetime.utcnow()},
        ]
        mock_cols = {
            "batches": MagicMock(),
        }
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value.limit.return_value = archived_batches
        mock_cols["batches"].find.return_value = mock_cursor

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.get(
                f"/api/vendors/{vendor_id}/batch-history",
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 2)
            self.assertTrue(data[0].get("is_historical"))

    def test_spoilage_prediction_skips_archived_batch(self):
        """Archived batch returns isStockOut: True and does not run ML model inference."""
        batch_id = "B20001_ARCHIVED"
        mock_batch = {
            "batch_id": batch_id,
            "vendor_id": "V100",
            "status": "archived",
            "product_name": "Idli Batter",
        }
        mock_vendor = {"vendor_id": "V100", "shop_name": "Lakshmi Idli Shop"}

        mock_cols = {
            "batches": MagicMock(),
            "vendors": MagicMock(),
        }
        mock_cols["batches"].find_one.return_value = mock_batch
        mock_cols["vendors"].find_one.return_value = mock_vendor

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.get(
                f"/api/batches/{batch_id}/predict-spoilage",
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data.get("riskLabel"), "None")
            self.assertTrue(data.get("isStockOut"))
    def test_get_available_batches(self):
        """GET /api/batches/available returns created, unassigned batches."""
        unassigned_batch = {
            "batch_id": "B_AVAIL_01",
            "status": "created",
            "vendor_id": "",
            "volume_kg": 25.0,
            "product_name": "Idli Batter",
        }
        mock_cols = {
            "batches": MagicMock(),
        }
        mock_cursor = MagicMock()
        mock_cursor.sort.return_value = [unassigned_batch]
        mock_cols["batches"].find.return_value = mock_cursor

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.get(
                "/api/batches/available",
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(len(data), 1)
            self.assertEqual(data[0]["batch_id"], "B_AVAIL_01")
            self.assertEqual(data[0]["status"], "created")

    def test_assign_batch_with_restock_request(self):
        """Assigning batch with restock_request_id approves the restock request."""
        batch_id = "B_NEW_99"
        vendor_id = "V100"
        restock_id = "RSR_V100_555"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_req = {
            "request_id": restock_id,
            "vendor_id": vendor_id,
            "status": "pending",
            "linked_order_id": "ORD_V100_555",
        }

        mock_cols = {
            "vendors": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "restock_requests": MagicMock(),
            "orders": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["batches"].find.return_value = []
        mock_cols["batches"].update_one.return_value.matched_count = 1
        mock_cols["restock_requests"].find_one.return_value = mock_req

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.put(
                f"/api/batches/{batch_id}/assign",
                json={"vendor_id": vendor_id, "restock_request_id": restock_id},
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("restock_request_id"), restock_id)
            mock_cols["restock_requests"].update_one.assert_called_once()
            mock_cols["orders"].update_one.assert_called_once()

    def test_mark_batch_stockout_archives_batch(self):
        """POST /api/batches/<id>/stockout sets status to archived and updates inventory."""
        batch_id = "B_STOCKOUT_01"
        vendor_id = "V100"
        mock_batch = {
            "batch_id": batch_id,
            "vendor_id": vendor_id,
            "status": "received",
            "volume_kg": 15.0,
            "product_name": "Idli Batter",
        }
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = {"vendor_id": vendor_id, "quantity": 15.0}

        mock_cols = {
            "batches": MagicMock(),
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["batches"].find_one.return_value = mock_batch
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find_one.return_value = mock_inv

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.post(
                f"/api/batches/{batch_id}/stockout",
                json={"reason": "Sold out completely in morning"},
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("status"), "archived")
            # Batch updated to archived
            call_args = mock_cols["batches"].update_one.call_args
            set_doc = call_args[0][1]["$set"]
            self.assertEqual(set_doc["status"], "archived")
            self.assertEqual(set_doc["archived_reason"], "vendor_stockout")
            # Movement logged
    def test_inventory_summary_zero_when_no_active_batches(self):
        """When vendor has no received batches in store, total active stock is 0.0kg and isStockOut is True."""
        vendor_id = "V100"
        mock_cols = {
            "batches": MagicMock(),
            "inventory": MagicMock(),
        }
        # find for status="received" returns empty list (all archived)
        # find for status="assigned" returns empty list
        mock_cols["batches"].find.side_effect = [
            [],  # received_batches
            [],  # assigned_batches
        ]
        mock_cols["inventory"].find.return_value = [{"vendor_id": vendor_id, "quantity": 20.0, "minimumStock": 10}]

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.get(
                f"/api/inventory/summary?vendor_id={vendor_id}",
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data.get("totalQuantityKg"), 0.0)
            self.assertTrue(data.get("isStockOut"))
            self.assertEqual(data.get("batchCount"), 0)
            self.assertEqual(data.get("receivedBatchCount"), 0)
            mock_cols["inventory"].update_many.assert_called_once()

    def test_forecast_available_stock_zero_when_no_active_batches(self):
        """When vendor has no received batches, forecast availableStock is 0.0kg."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop", "localityTier": "residential_budget"}
        mock_cols = {
            "vendors": MagicMock(),
            "batches": MagicMock(),
            "inventory": MagicMock(),
            "orders": MagicMock(),
            "order_items": MagicMock(),
            "weather_forecast": MagicMock(),
            "festival_calendar": MagicMock(),
            "predictions": MagicMock(),
            "feature_snapshots": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["batches"].find.return_value = []  # no active batches
        mock_cols["inventory"].find.return_value = [{"vendor_id": vendor_id, "quantity": 20.0, "minimumStock": 10}]
        mock_cols["orders"].find.return_value.sort.return_value.limit.return_value = []
        mock_cols["orders"].count_documents.return_value = 0
        mock_cols["order_items"].find.return_value = []
        mock_cols["weather_forecast"].find_one.return_value = None
        mock_cols["festival_calendar"].find_one.return_value = None
        mock_cols["predictions"].insert_one.return_value.inserted_id = "PRED_123"

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.get(
                f"/api/vendors/{vendor_id}/demand-forecast",
                headers=self.vendor_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data.get("availableStock"), 0.0)
            self.assertEqual(data.get("currentStock"), 0.0)

    def test_admin_add_batch_creates_batch_document(self):
        """When admin adds batches to a vendor via mutate_inventory, a received batch document is created."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = [{"_id": "INV_1", "vendor_id": vendor_id, "quantity": 0.0, "product_name": "Idli Batter"}]

        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find.return_value = mock_inv
        mock_cols["batches"].find_one.return_value = None

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.post(
                "/api/inventory",
                json={
                    "vendor_id": vendor_id,
                    "action": "add_batch",
                    "quantity_delta": 15.0,
                    "batch_id": "B99999",
                    "product_name": "Idli Batter",
                },
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("totalQuantity"), 15.0)
            self.assertEqual(data.get("batch_id"), "B99999")

            # Check batch document inserted into COLS["batches"]
            mock_cols["batches"].insert_one.assert_called_once()
            inserted_batch = mock_cols["batches"].insert_one.call_args[0][0]
            self.assertEqual(inserted_batch["batch_id"], "B99999")
            self.assertEqual(inserted_batch["vendor_id"], vendor_id)
            self.assertEqual(inserted_batch["status"], "received")
            self.assertEqual(inserted_batch["volume_kg"], 15.0)
            self.assertEqual(inserted_batch["quantity_kg"], 15.0)

            # Check inventory updated with batch_number
            mock_cols["inventory"].update_one.assert_called_once()
            update_payload = mock_cols["inventory"].update_one.call_args[0][1]["$set"]
            self.assertEqual(update_payload["quantity"], 15.0)
            self.assertEqual(update_payload["batch_number"], "B99999")

    def test_admin_add_batch_assigns_existing_unassigned_batch(self):
        """When admin adds stock referencing an existing unassigned batch, that batch is assigned and received."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = [{"_id": "INV_1", "vendor_id": vendor_id, "quantity": 5.0, "product_name": "Idli Batter"}]
        existing_batch = {
            "batch_id": "B_CENTRAL_01",
            "status": "created",
            "volume_kg": 15.0,
            "vendor_id": None,
        }

        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find.return_value = mock_inv
        mock_cols["batches"].find_one.return_value = existing_batch

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.post(
                "/api/inventory",
                json={
                    "vendor_id": vendor_id,
                    "action": "add_batch",
                    "quantity_delta": 15.0,
                    "batch_id": "B_CENTRAL_01",
                },
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("batch_id"), "B_CENTRAL_01")
            self.assertEqual(data.get("totalQuantity"), 20.0)

            mock_cols["batches"].update_one.assert_called_once()
            set_fields = mock_cols["batches"].update_one.call_args[0][1]["$set"]
            self.assertEqual(set_fields["vendor_id"], vendor_id)
            self.assertEqual(set_fields["status"], "received")

    def test_admin_edit_creates_batch_if_none_exists(self):
        """When admin edits stock from 0 to positive and vendor has no batch, an active batch is created."""
        vendor_id = "V100"
        mock_vendor = {"vendor_id": vendor_id, "shop_name": "Lakshmi Idli Shop"}
        mock_inv = [{"_id": "INV_1", "vendor_id": vendor_id, "quantity": 0.0, "product_name": "Idli Batter"}]

        mock_cols = {
            "vendors": MagicMock(),
            "inventory": MagicMock(),
            "batches": MagicMock(),
            "inventory_movement": MagicMock(),
            "logs": MagicMock(),
        }
        mock_cols["vendors"].find_one.return_value = mock_vendor
        mock_cols["inventory"].find.return_value = mock_inv
        mock_cols["batches"].find.return_value = []
        mock_cols["batches"].find_one.return_value = None

        with patch.dict(flask_app.COLS, mock_cols):
            res = self.client.post(
                "/api/inventory",
                json={
                    "vendor_id": vendor_id,
                    "action": "edit",
                    "quantity": 25.0,
                },
                headers=self.admin_headers,
            )
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertTrue(data.get("ok"))
            self.assertEqual(data.get("totalQuantity"), 25.0)
            self.assertIsNotNone(data.get("batch_id"))
            mock_cols["batches"].insert_one.assert_called_once()
            batch_doc = mock_cols["batches"].insert_one.call_args[0][0]
            self.assertEqual(batch_doc["status"], "received")
            self.assertEqual(batch_doc["volume_kg"], 25.0)
            self.assertEqual(batch_doc["vendor_id"], vendor_id)


if __name__ == "__main__":
    unittest.main()


