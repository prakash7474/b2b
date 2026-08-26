# B2P Admin Panel

A Flask-based admin dashboard for managing vendors, inventory, orders, and monitoring spoilage risk and demand forecasts using ML models.

## Prerequisites

- Python 3.9 or higher
- MongoDB Atlas account (or local MongoDB)
- ML model files in `new/` directory

## Setup

### 1. Install Dependencies

```bash
cd new
pip install -r requirements.txt
```

### 2. Environment Variables

Set the MongoDB connection string (optional - has default):

```bash
# Windows (PowerShell)
$env:MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net"

# Linux/Mac
export MONGODB_URI="mongodb+srv://username:password@cluster.mongodb.net"
```

If not set, uses the hardcoded connection string in the code.

### 3. Required Files

Ensure these ML model files exist in `new/` directory:
- `demand_forecast_model.pkl`
- `spoilage_risk_model.pkl`

## Running the Admin Panel

```bash
cd new/admin
python admin_app.py
```

The server starts at: **http://localhost:5001**

On first run, it automatically seeds the database with sample data:
- 5 vendors
- 10 inventory items
- 8 orders
- 8 alerts
- 7 recommendations

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard` | GET | Dashboard stats |
| `/api/vendors` | GET | List all vendors |
| `/api/vendors/<id>` | GET | Get vendor details |
| `/api/vendors/<id>/inventory` | GET | Vendor's inventory |
| `/api/vendors/<id>/orders` | GET | Vendor's orders |
| `/api/vendors/<id>/verify` | PUT | Verify/reject vendor |
| `/api/vendors/<id>/demand-forecast` | GET | ML demand prediction |
| `/api/inventory` | GET | List all inventory |
| `/api/inventory/<id>` | GET | Inventory item details |
| `/api/inventory/<id>/spoilage-risk` | GET | ML spoilage risk |
| `/api/orders` | GET | List orders (filterable) |
| `/api/orders/<id>` | GET | Order with items |
| `/api/alerts` | GET | Inventory alerts |
| `/api/recommendations` | GET | Vendor recommendations |

## Troubleshooting

**Connection Error:**
- Verify MongoDB URI is correct
- Check network/firewall allows MongoDB Atlas access

**Model Not Found:**
- Ensure `.pkl` files are in `new/` directory (parent of admin/)
- Run `new/retrain_models.py` to regenerate models

**Port Already in Use:**
- Change port in `admin_app.py` line: `app.run(..., port=5001)`
- Or kill the process using port 5001
