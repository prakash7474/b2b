"""
Seed script for B2P Admin Panel.
Populates all MongoDB collections with realistic sample data.
"""

from datetime import datetime, timedelta
from pymongo import MongoClient
import os

MONGODB_URI = os.environ.get(
    "MONGODB_URI",
    "mongodb+srv://rioprakash47_db_user:q7ngEz0PZF3L9szJ@cluster0.ziuzjl5.mongodb.net"
)
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
db = client["b2p_admin"]

now = datetime.utcnow()

# ── USERS ──────────────────────────────────────────────────────
users = [
    {"user_id": "U001", "email": "admin@b2p.com", "phone": "9000000001", "role": "admin", "is_verified": True},
    {"user_id": "U100", "email": "lakshmi@email.com", "phone": "9876543210", "role": "vendor", "is_verified": True},
    {"user_id": "U101", "email": "karthik@email.com", "phone": "9876543211", "role": "vendor", "is_verified": True},
    {"user_id": "U102", "email": "fresh@email.com", "phone": "9876543212", "role": "vendor", "is_verified": True},
    {"user_id": "U103", "email": "campus@email.com", "phone": "9876543213", "role": "vendor", "is_verified": True},
    {"user_id": "U104", "email": "rk@email.com", "phone": "9876543214", "role": "vendor", "is_verified": False},
    {"user_id": "U200", "email": "customer1@email.com", "phone": "9880000001", "role": "customer", "is_verified": True},
    {"user_id": "U201", "email": "customer2@email.com", "phone": "9880000002", "role": "customer", "is_verified": True},
    {"user_id": "U202", "email": "customer3@email.com", "phone": "9880000003", "role": "customer", "is_verified": True},
]

# ── VENDORS ────────────────────────────────────────────────────
vendors = [
    {"vendor_id": "V100", "user_id": "U100", "shop_name": "Lakshmi Idli Shop", "owner_name": "Lakshmi Devi",
     "phone": "9876543210", "email": "lakshmi@email.com", "address": "12 Main Road, T Nagar, Chennai",
     "fssai_number": "FSSAI-1001", "verification_status": "verified", "rating": 4.5, "rating_count": 120,
     "latitude": 13.0418, "longitude": 80.2341},
    {"vendor_id": "V101", "user_id": "U101", "shop_name": "Karthik Dosa Center", "owner_name": "Karthik Raj",
     "phone": "9876543211", "email": "karthik@email.com", "address": "45 Anna Salai, Nungambakkam, Chennai",
     "fssai_number": "FSSAI-1002", "verification_status": "verified", "rating": 3.8, "rating_count": 85,
     "latitude": 13.0604, "longitude": 80.2496},
    {"vendor_id": "V102", "user_id": "U102", "shop_name": "Fresh Batter Corner", "owner_name": "Priya Sharma",
     "phone": "9876543212", "email": "fresh@email.com", "address": "78 Velachery Main Road, Chennai",
     "fssai_number": "FSSAI-1003", "verification_status": "verified", "rating": 4.2, "rating_count": 95,
     "latitude": 12.9815, "longitude": 80.2180},
    {"vendor_id": "V103", "user_id": "U103", "shop_name": "Campus Canteen", "owner_name": "Ravi Kumar",
     "phone": "9876543213", "email": "campus@email.com", "address": "IIT Madras Campus, Adyar, Chennai",
     "fssai_number": "FSSAI-1004", "verification_status": "verified", "rating": 4.6, "rating_count": 200,
     "latitude": 12.9916, "longitude": 80.2336},
    {"vendor_id": "V104", "user_id": "U104", "shop_name": "RK Batter House", "owner_name": "Rajesh Kumar",
     "phone": "9876543214", "email": "rk@email.com", "address": "23 OMR Road, Sholinganallur, Chennai",
     "fssai_number": "FSSAI-1005", "verification_status": "pending", "rating": 3.5, "rating_count": 30,
     "latitude": 12.9010, "longitude": 80.2279},
]

# ── PRODUCTS ───────────────────────────────────────────────────
products = [
    {"product_id": "P001", "product_name": "Idli Batter", "category": "batter", "unit_type": "kg",
     "shelf_life_ambient_hrs": 24, "shelf_life_fridge_hrs": 72},
    {"product_id": "P002", "product_name": "Dosa Batter", "category": "batter", "unit_type": "kg",
     "shelf_life_ambient_hrs": 20, "shelf_life_fridge_hrs": 60},
    {"product_id": "P003", "product_name": "Combo Pack", "category": "combo", "unit_type": "kg",
     "shelf_life_ambient_hrs": 18, "shelf_life_fridge_hrs": 54},
    {"product_id": "P004", "product_name": "Rava Batter", "category": "batter", "unit_type": "kg",
     "shelf_life_ambient_hrs": 16, "shelf_life_fridge_hrs": 48},
]

# ── INVENTORY ──────────────────────────────────────────────────
inventory = [
    {"inventory_id": "INV001", "vendor_id": "V100", "product_id": "P001", "product_name": "Idli Batter",
     "batch_number": "B001", "quantity": 25, "minimum_stock": 10, "price": 120.0,
     "manufacture_date": now - timedelta(hours=12), "expiry_date": now + timedelta(hours=36),
     "freshness_score": 0.15, "received_at": now - timedelta(hours=10)},
    {"inventory_id": "INV002", "vendor_id": "V100", "product_id": "P002", "product_name": "Dosa Batter",
     "batch_number": "B002", "quantity": 15, "minimum_stock": 10, "price": 140.0,
     "manufacture_date": now - timedelta(hours=20), "expiry_date": now + timedelta(hours=28),
     "freshness_score": 0.45, "received_at": now - timedelta(hours=18)},
    {"inventory_id": "INV003", "vendor_id": "V101", "product_id": "P001", "product_name": "Idli Batter",
     "batch_number": "B003", "quantity": 8, "minimum_stock": 10, "price": 115.0,
     "manufacture_date": now - timedelta(hours=30), "expiry_date": now + timedelta(hours=10),
     "freshness_score": 0.75, "received_at": now - timedelta(hours=28)},
    {"inventory_id": "INV004", "vendor_id": "V101", "product_id": "P002", "product_name": "Dosa Batter",
     "batch_number": "B004", "quantity": 30, "minimum_stock": 10, "price": 135.0,
     "manufacture_date": now - timedelta(hours=6), "expiry_date": now + timedelta(hours=42),
     "freshness_score": 0.08, "received_at": now - timedelta(hours=5)},
    {"inventory_id": "INV005", "vendor_id": "V102", "product_id": "P003", "product_name": "Combo Pack",
     "batch_number": "B005", "quantity": 5, "minimum_stock": 8, "price": 200.0,
     "manufacture_date": now - timedelta(hours=36), "expiry_date": now + timedelta(hours=6),
     "freshness_score": 0.82, "received_at": now - timedelta(hours=34)},
    {"inventory_id": "INV006", "vendor_id": "V102", "product_id": "P001", "product_name": "Idli Batter",
     "batch_number": "B006", "quantity": 22, "minimum_stock": 10, "price": 125.0,
     "manufacture_date": now - timedelta(hours=8), "expiry_date": now + timedelta(hours=40),
     "freshness_score": 0.12, "received_at": now - timedelta(hours=7)},
    {"inventory_id": "INV007", "vendor_id": "V103", "product_id": "P001", "product_name": "Idli Batter",
     "batch_number": "B007", "quantity": 40, "minimum_stock": 15, "price": 110.0,
     "manufacture_date": now - timedelta(hours=4), "expiry_date": now + timedelta(hours=44),
     "freshness_score": 0.05, "received_at": now - timedelta(hours=3)},
    {"inventory_id": "INV008", "vendor_id": "V103", "product_id": "P004", "product_name": "Rava Batter",
     "batch_number": "B008", "quantity": 12, "minimum_stock": 10, "price": 130.0,
     "manufacture_date": now - timedelta(hours=22), "expiry_date": now + timedelta(hours=14),
     "freshness_score": 0.55, "received_at": now - timedelta(hours=20)},
    {"inventory_id": "INV009", "vendor_id": "V104", "product_id": "P002", "product_name": "Dosa Batter",
     "batch_number": "B009", "quantity": 3, "minimum_stock": 10, "price": 145.0,
     "manufacture_date": now - timedelta(hours=40), "expiry_date": now - timedelta(hours=2),
     "freshness_score": 0.92, "received_at": now - timedelta(hours=38)},
    {"inventory_id": "INV010", "vendor_id": "V104", "product_id": "P003", "product_name": "Combo Pack",
     "batch_number": "B010", "quantity": 18, "minimum_stock": 8, "price": 195.0,
     "manufacture_date": now - timedelta(hours=14), "expiry_date": now + timedelta(hours=24),
     "freshness_score": 0.35, "received_at": now - timedelta(hours=12)},
]

# ── ORDERS ─────────────────────────────────────────────────────
orders = [
    {"order_id": "ORD001", "user_id": "U200", "vendor_id": "V100", "order_date": now - timedelta(days=3),
     "total_amount": 360.0, "payment_method": "upi", "payment_status": "paid", "order_status": "delivered",
     "delivery_type": "delivery", "delivery_address": "15 Adyar Bridge Road, Chennai"},
    {"order_id": "ORD002", "user_id": "U201", "vendor_id": "V100", "order_date": now - timedelta(days=2),
     "total_amount": 240.0, "payment_method": "cash", "payment_status": "paid", "order_status": "delivered",
     "delivery_type": "pickup", "delivery_address": ""},
    {"order_id": "ORD003", "user_id": "U202", "vendor_id": "V101", "order_date": now - timedelta(days=1),
     "total_amount": 510.0, "payment_method": "upi", "payment_status": "paid", "order_status": "delivered",
     "delivery_type": "delivery", "delivery_address": "22 Guindy Industrial Estate, Chennai"},
    {"order_id": "ORD004", "user_id": "U200", "vendor_id": "V102", "order_date": now - timedelta(hours=18),
     "total_amount": 400.0, "payment_method": "card", "payment_status": "paid", "order_status": "out_for_delivery",
     "delivery_type": "delivery", "delivery_address": "15 Adyar Bridge Road, Chennai"},
    {"order_id": "ORD005", "user_id": "U201", "vendor_id": "V103", "order_date": now - timedelta(hours=10),
     "total_amount": 330.0, "payment_method": "upi", "payment_status": "paid", "order_status": "preparing",
     "delivery_type": "delivery", "delivery_address": "8 Thiruvanmiyur Beach Road, Chennai"},
    {"order_id": "ORD006", "user_id": "U202", "vendor_id": "V101", "order_date": now - timedelta(hours=6),
     "total_amount": 270.0, "payment_method": "cash", "payment_status": "pending", "order_status": "pending",
     "delivery_type": "pickup", "delivery_address": ""},
    {"order_id": "ORD007", "user_id": "U200", "vendor_id": "V104", "order_date": now - timedelta(hours=3),
     "total_amount": 590.0, "payment_method": "upi", "payment_status": "paid", "order_status": "pending",
     "delivery_type": "delivery", "delivery_address": "15 Adyar Bridge Road, Chennai"},
    {"order_id": "ORD008", "user_id": "U201", "vendor_id": "V103", "order_date": now - timedelta(hours=2),
     "total_amount": 220.0, "payment_method": "card", "payment_status": "paid", "order_status": "confirmed",
     "delivery_type": "delivery", "delivery_address": "8 Thiruvanmiyur Beach Road, Chennai"},
]

# ── ORDER ITEMS ────────────────────────────────────────────────
order_items = [
    {"order_item_id": "OI001", "order_id": "ORD001", "inventory_id": "INV001", "quantity": 2, "unit_price": 120.0, "subtotal": 240.0},
    {"order_item_id": "OI002", "order_id": "ORD001", "inventory_id": "INV002", "quantity": 1, "unit_price": 140.0, "subtotal": 120.0},
    {"order_item_id": "OI003", "order_id": "ORD002", "inventory_id": "INV001", "quantity": 2, "unit_price": 120.0, "subtotal": 240.0},
    {"order_item_id": "OI004", "order_id": "ORD003", "inventory_id": "INV003", "quantity": 1, "unit_price": 115.0, "subtotal": 115.0},
    {"order_item_id": "OI005", "order_id": "ORD003", "inventory_id": "INV004", "quantity": 3, "unit_price": 135.0, "subtotal": 405.0},
    {"order_item_id": "OI006", "order_id": "ORD004", "inventory_id": "INV005", "quantity": 2, "unit_price": 200.0, "subtotal": 400.0},
    {"order_item_id": "OI007", "order_id": "ORD005", "inventory_id": "INV007", "quantity": 3, "unit_price": 110.0, "subtotal": 330.0},
    {"order_item_id": "OI008", "order_id": "ORD006", "inventory_id": "INV004", "quantity": 2, "unit_price": 135.0, "subtotal": 270.0},
    {"order_item_id": "OI009", "order_id": "ORD007", "inventory_id": "INV009", "quantity": 4, "unit_price": 145.0, "subtotal": 580.0},
    {"order_item_id": "OI010", "order_id": "ORD008", "inventory_id": "INV008", "quantity": 1, "unit_price": 130.0, "subtotal": 130.0},
    {"order_item_id": "OI011", "order_id": "ORD008", "inventory_id": "INV007", "quantity": 1, "unit_price": 110.0, "subtotal": 110.0},
]

# ── INVENTORY ALERTS ───────────────────────────────────────────
inventory_alerts = [
    {"alert_id": "ALT001", "inventory_id": "INV003", "alert_type": "low_stock",
     "alert_message": "Idli Batter at V101 is below minimum stock (8 < 10)",
     "alert_status": "active", "generated_time": now - timedelta(hours=2)},
    {"alert_id": "ALT002", "inventory_id": "INV005", "alert_type": "low_stock",
     "alert_message": "Combo Pack at V102 is below minimum stock (5 < 8)",
     "alert_status": "active", "generated_time": now - timedelta(hours=4)},
    {"alert_id": "ALT003", "inventory_id": "INV009", "alert_type": "expiry_warning",
     "alert_message": "Dosa Batter batch B009 at V104 has expired",
     "alert_status": "active", "generated_time": now - timedelta(hours=1)},
    {"alert_id": "ALT004", "inventory_id": "INV009", "alert_type": "spoilage_risk",
     "alert_message": "Dosa Batter batch B009 freshness score 0.92 - HIGH SPOILAGE RISK",
     "alert_status": "active", "generated_time": now - timedelta(hours=1)},
    {"alert_id": "ALT005", "inventory_id": "INV005", "alert_type": "spoilage_risk",
     "alert_message": "Combo Pack batch B005 freshness score 0.82 - HIGH SPOILAGE RISK",
     "alert_status": "active", "generated_time": now - timedelta(hours=3)},
    {"alert_id": "ALT006", "inventory_id": "INV004", "alert_type": "low_stock",
     "alert_message": "Dosa Batter at V101 is below minimum stock (3 < 10)",
     "alert_status": "acknowledged", "generated_time": now - timedelta(hours=8)},
    {"alert_id": "ALT007", "inventory_id": "INV010", "alert_type": "spoilage_risk",
     "alert_message": "Combo Pack batch B010 freshness score 0.35 - MEDIUM SPOILAGE RISK",
     "alert_status": "resolved", "generated_time": now - timedelta(days=1)},
    {"alert_id": "ALT008", "inventory_id": "INV008", "alert_type": "expiry_warning",
     "alert_message": "Rava Batter batch B008 expires in 14 hours",
     "alert_status": "active", "generated_time": now - timedelta(hours=5)},
]

# ── VENDOR RECOMMENDATIONS ─────────────────────────────────────
vendor_recommendations = [
    {"recommendation_id": "REC001", "vendor_id": "V103", "customer_id": "U200",
     "distance": 2.1, "stock_score": 0.95, "freshness_score": 0.92, "rating_score": 0.91, "recommendation_rank": 1},
    {"recommendation_id": "REC002", "vendor_id": "V100", "customer_id": "U200",
     "distance": 3.5, "stock_score": 0.80, "freshness_score": 0.88, "rating_score": 0.85, "recommendation_rank": 2},
    {"recommendation_id": "REC003", "vendor_id": "V102", "customer_id": "U200",
     "distance": 4.2, "stock_score": 0.70, "freshness_score": 0.85, "rating_score": 0.82, "recommendation_rank": 3},
    {"recommendation_id": "REC004", "vendor_id": "V103", "customer_id": "U201",
     "distance": 1.8, "stock_score": 0.95, "freshness_score": 0.92, "rating_score": 0.91, "recommendation_rank": 1},
    {"recommendation_id": "REC005", "vendor_id": "V101", "customer_id": "U201",
     "distance": 2.9, "stock_score": 0.65, "freshness_score": 0.70, "rating_score": 0.75, "recommendation_rank": 2},
    {"recommendation_id": "REC006", "vendor_id": "V100", "customer_id": "U202",
     "distance": 5.0, "stock_score": 0.80, "freshness_score": 0.88, "rating_score": 0.85, "recommendation_rank": 1},
    {"recommendation_id": "REC007", "vendor_id": "V103", "customer_id": "U202",
     "distance": 6.3, "stock_score": 0.95, "freshness_score": 0.92, "rating_score": 0.91, "recommendation_rank": 2},
]


def seed():
    collections = {
        "users": users,
        "vendors": vendors,
        "products": products,
        "inventory": inventory,
        "orders": orders,
        "order_items": order_items,
        "inventory_alerts": inventory_alerts,
        "vendor_recommendations": vendor_recommendations,
    }
    for name, docs in collections.items():
        col = db[name]
        if col.count_documents({}) == 0:
            col.insert_many(docs)
            print(f"  [OK] Seeded {len(docs)} {name}")
        else:
            print(f"  [--] {name} already has data, skipping")


if __name__ == "__main__":
    print("\nSeeding B2P Admin database...\n")
    seed()
    print("\nDone!")
