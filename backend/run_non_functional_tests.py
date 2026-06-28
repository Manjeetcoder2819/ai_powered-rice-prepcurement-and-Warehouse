import os
import sys
import time
import asyncio
from pathlib import Path

# Setup environment variable to use test database
os.environ["TESTING"] = "1"

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
sys.path.append(str(backend_dir))

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import AsyncSessionLocal, create_tables, seed_database
from sqlalchemy import select, delete
from app.models.farmer import FarmerModel
from app.models.vehicle import VehicleModel
from app.models.bags import BatchModel
from app.models.warehouse import StockModel, ZoneModel, LedgerModel

def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

class TestRiceAMSNonFunctional(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        run_async(create_tables())
        run_async(seed_database())

    def setUp(self):
        # Truncate tables to ensure a clean state
        async def clean():
            async with AsyncSessionLocal() as db:
                await db.execute(delete(FarmerModel))
                await db.execute(delete(BatchModel))
                await db.execute(delete(LedgerModel))
                await db.commit()
        run_async(clean())

    def test_6_1_performance_testing(self):
        print("\n--- Running Test 6.1: Performance Testing ---")
        
        # 1. Benchmark Farmer Registration & Slot Booking (Target: <3s)
        # We will insert 100 farmer records (50 bookings on different dates/times to avoid capacity warnings)
        start_time = time.time()
        for i in range(1, 101):
            date_offset = i % 10  # spread across 10 dates to stay under 20 tons daily limit
            payload = {
                "name": f"Farmer Perf {i}",
                "mobile": f"+91 95000 {i:05d}",
                "village": "Sanaswadi",
                "aadhaar_last4": f"{i:04d}",
                "variety": "Sona Masoori",
                "bags": 2,
                "cultivated_area": 0.05,
                "harvest_date": f"2026-07-{10 + date_offset:02d}",
                "slot_date": f"2026-07-{10 + date_offset:02d}",
                "slot_time": "10:00 AM"
            }
            res = self.client.post("/api/v1/farmers", json=payload)
            self.assertEqual(res.status_code, 200)
        
        total_register_time = time.time() - start_time
        avg_register_time = total_register_time / 100
        print(f"[PERF] Registered 100 farmers in {total_register_time:.3f}s. Avg: {avg_register_time:.3f}s per booking.")
        self.assertLess(avg_register_time, 3.0, "Average slot booking time exceeded 3 seconds limit")

        # 2. Benchmark Dashboard Load Performance (Target: <5s)
        start_time = time.time()
        res_dash = self.client.get("/api/v1/dashboard/kpis")
        self.assertEqual(res_dash.status_code, 200)
        dash_time = time.time() - start_time
        print(f"[PERF] Dashboard retrieved in {dash_time:.3f}s.")
        self.assertLess(dash_time, 5.0, "Dashboard load time exceeded 5 seconds limit")

        # 3. Benchmark ANPR Gate Verification (Target: <10s)
        # Register a standby vehicle and assign it to farmer 1
        res_farmers = self.client.get("/api/v1/farmers")
        farmer_id = res_farmers.json()[0]["id"]
        
        # Make sure MH14CD9087 is standby and assign it
        self.client.post(f"/api/v1/vehicles/MH14CD9087/assign/{farmer_id}")
        
        # Test ANPR Gate verification speed
        start_time = time.time()
        res_gate = self.client.post("/api/v1/vehicles/gate-verify", json={
            "vehicle_id": "MH14CD9087", "confidence": 0.95
        })
        self.assertEqual(res_gate.status_code, 200)
        gate_time = time.time() - start_time
        print(f"[PERF] ANPR Gate verification completed in {gate_time:.3f}s.")
        self.assertLess(gate_time, 10.0, "ANPR verification exceeded 10 seconds limit")

        # 4. Benchmark Bag Quality Scan & Defect Detection (Target: <15s)
        start_time = time.time()
        res_scan = self.client.post(f"/api/v1/bags/scan/{farmer_id}", json={
            "expected_bags": 80, "detected_bags": 78, "damage_pct": 5.0
        })
        self.assertEqual(res_scan.status_code, 200)
        scan_time = time.time() - start_time
        print(f"[PERF] Bag quality scanning/defect prediction finished in {scan_time:.3f}s.")
        self.assertLess(scan_time, 15.0, "Bag defect detection scan exceeded 15 seconds limit")

    def test_6_2_offline_operation(self):
        print("\n--- Running Test 6.2: Offline Operation ---")
        # Ensure fallback local SQLite is used and local predictions are functional offline
        # Let's inspect local database access by fetching active price and prediction profiles
        res = self.client.get("/api/v1/farmers")
        self.assertEqual(res.status_code, 200)
        
        # Call training profile model endpoint (offline training on startup)
        res_summary = self.client.get("/api/v1/dashboard/model-training")
        self.assertEqual(res_summary.status_code, 200)
        data = res_summary.json()
        self.assertEqual(data["model"], "offline_quality_risk_blended_average_v1")
        print(f"[OFFLINE] Blended offline model verified: {data['model']}. Data source uses local: {data['dataset_file']}")

    def test_6_3_data_persistence(self):
        print("\n--- Running Test 6.3: Data Persistence Testing ---")
        # 1. Create a booking
        payload = {
            "name": "Persist Test", "mobile": "+91 93333 33333", "variety": "Basmati",
            "cultivated_area": 1.0, "harvest_date": "2026-07-01"
        }
        res_create = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(res_create.status_code, 200)
        token = res_create.json()["token"]
        
        # 2. Reset the database session (simulating restart)
        # We can close and recreate the TestClient
        self.client = TestClient(app)
        
        # 3. Retrieve and inspect the booking after "restart"
        res_check = self.client.get("/api/v1/farmers")
        farmers = res_check.json()
        target = next((f for f in farmers if f["token"] == token), None)
        self.assertIsNotNone(target, "Seeded transaction was not persisted in database after session restart!")
        self.assertEqual(target["name"], "Persist Test")
        print("[SUCCESS] Data persistence verified. Records successfully recovered after session reset.")

    def test_6_4_error_handling(self):
        print("\n--- Running Test 6.4: Error Handling Testing ---")
        
        # 1. Test duplicate booking on same date
        payload = {
            "name": "Error Test", "mobile": "+91 94444 44444", "variety": "IR-64",
            "cultivated_area": 1.0, "harvest_date": "2026-07-02"
        }
        self.client.post("/api/v1/farmers", json=payload)
        res_dup = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("Duplicate booking", res_dup.json()["detail"])
        print("[SUCCESS] Duplicate booking rejected with a clean validation message.")

        # 2. Capacity exceeded error
        payload_huge = {
            "name": "Huge Farmer", "mobile": "+91 94444 55555", "variety": "IR-64",
            "cultivated_area": 12.0,  # 12 acres * 2000 kg/acre = 24,000 kg (exceeds 20,000 kg daily limit)
            "harvest_date": "2026-07-03"
        }
        res_capacity = self.client.post("/api/v1/farmers", json=payload_huge)
        self.assertEqual(res_capacity.status_code, 400)
        self.assertIn("Daily procurement capacity limit", res_capacity.json()["detail"])
        print("[SUCCESS] Exceeding daily procurement capacity (20 tons) rejected with clean details.")

        # 3. Invalid/Negative cultivated area
        payload_neg = {
            "name": "Bad Area", "mobile": "+91 94444 66666", "variety": "IR-64",
            "cultivated_area": -1.0, "harvest_date": "2026-07-04"
        }
        res_neg = self.client.post("/api/v1/farmers", json=payload_neg)
        self.assertEqual(res_neg.status_code, 400)
        self.assertIn("Cultivated area must be a positive number", res_neg.json()["detail"])
        print("[SUCCESS] Invalid negative cultivated area rejected cleanly.")

if __name__ == "__main__":
    unittest.main()
