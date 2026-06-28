import os
import sys
import asyncio
from pathlib import Path

# Setup environment variable before imports to use test DB
os.environ["TESTING"] = "1"

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
sys.path.append(str(backend_dir))

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import AsyncSessionLocal, create_tables, seed_database
from sqlalchemy import select, update
from app.models.farmer import FarmerModel
from app.models.vehicle import VehicleModel
from app.models.bags import BatchModel
from app.models.warehouse import StockModel, ZoneModel, LedgerModel
from app.models.sms_log import SMSLogModel

# Helper to run async code inside sync unittest
def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

class TestRiceAMSFunctionalFeatures(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def setUp(self):
        # Clean farmer, batch, and ledger tables before each test
        run_async(self.clean_database())

    async def clean_database(self):
        from sqlalchemy import delete
        async with AsyncSessionLocal() as db:
            await db.execute(delete(FarmerModel))
            await db.execute(delete(BatchModel))
            await db.execute(delete(LedgerModel))
            await db.execute(delete(SMSLogModel))
            
            # Reset default stock quantities
            await db.execute(
                update(StockModel)
                .where(StockModel.zone == "A")
                .values(qty_kg=2200000.0)
            )
            await db.execute(
                update(StockModel)
                .where(StockModel.zone == "D")
                .values(qty_kg=0.0)
            )
            
            # Reset vehicles to standby
            await db.execute(
                update(VehicleModel)
                .values(status="standby", route="", load="", progress_pct=0, schedule_time="")
            )
            await db.commit()

    def test_4_1_farmer_registration_and_slot_booking(self):
        print("\n--- Running Test 4.1: Farmer Registration and Slot Booking ---")
        # 1. Valid registration
        payload = {
            "name": "Ravi",
            "mobile": "+91 91111 11111",
            "village": "Sanaswadi",
            "aadhaar_last4": "1111",
            "variety": "Sona Masoori",
            "bags": 80,
            "cultivated_area": 2.0,
            "harvest_date": "2026-06-25",
            "slot_date": "2026-06-25",
            "slot_time": "09:00 AM"
        }
        res = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        
        # Verify saved yield (2.0 acres * 2000 kg/acre = 4000 kg)
        self.assertEqual(data["name"], "Ravi")
        self.assertEqual(data["predicted_yield_kg"], 4000.0)
        self.assertEqual(data["bags"], 80)
        self.assertEqual(data["recommended_vehicle"], "Mini truck")
        self.assertEqual(data["slot_time"], "09:00 AM")
        self.assertIsNotNone(data["token"])
        print("[SUCCESS] Valid farmer registered successfully. Yield = 4000 Kg, Vehicle = Mini truck.")

        # 2. Blank fields validation
        bad_payload_blank = payload.copy()
        bad_payload_blank["variety"] = ""
        # Variety is a required Pydantic model string, check invalid area
        bad_payload_area = payload.copy()
        bad_payload_area["cultivated_area"] = 0.0
        
        res_bad = self.client.post("/api/v1/farmers", json=bad_payload_area)
        self.assertEqual(res_bad.status_code, 400)
        self.assertIn("Cultivated area must be a positive number", res_bad.json()["detail"])
        print("[SUCCESS] Validation correctly caught invalid area (0 acres) booking request.")

    def test_4_2_yield_prediction_and_vehicle_recommendation(self):
        print("\n--- Running Test 4.2: Yield Prediction and Vehicle Recommendation ---")
        # Test 1 acre (yield = 2 tons -> Mini truck)
        res_1 = self.client.post("/api/v1/farmers", json={
            "name": "F1", "mobile": "+91 99901 00000", "variety": "Sona Masoori",
            "cultivated_area": 1.0, "harvest_date": "2026-06-25", "slot_time": "09:00 AM"
        })
        self.assertEqual(res_1.json()["recommended_vehicle"], "Mini truck")
        
        # Test 3 acres (yield = 6 tons -> Medium truck)
        res_3 = self.client.post("/api/v1/farmers", json={
            "name": "F3", "mobile": "+91 99903 00000", "variety": "Sona Masoori",
            "cultivated_area": 3.0, "harvest_date": "2026-06-25", "slot_time": "10:00 AM"
        })
        self.assertEqual(res_3.json()["recommended_vehicle"], "Medium truck")

        # Test 10 acres (yield = 20 tons -> Large truck)
        # Note: We use a different harvest date so we don't hit the daily 20 tons capacity limit during registration
        res_10 = self.client.post("/api/v1/farmers", json={
            "name": "F10", "mobile": "+91 99910 00000", "variety": "Sona Masoori",
            "cultivated_area": 10.0, "harvest_date": "2026-06-26", "slot_time": "11:00 AM"
        })
        self.assertEqual(res_10.json()["recommended_vehicle"], "Large truck")
        print("[SUCCESS] Vehicle recommendations change logically with yield volume (1A->Mini, 3A->Medium, 10A->Large).")

    def test_4_3_slot_scheduling(self):
        print("\n--- Running Test 4.3: Slot Scheduling ---")
        # 1. First farmer (10 tons on 2026-06-25)
        self.client.post("/api/v1/farmers", json={
            "name": "Farmer Alpha", "mobile": "+91 99999 11111", "variety": "IR-64",
            "cultivated_area": 5.0, "harvest_date": "2026-06-25", "slot_time": "09:00 AM"
        })
        
        # 2. Second farmer (another 10 tons on 2026-06-25)
        self.client.post("/api/v1/farmers", json={
            "name": "Farmer Beta", "mobile": "+91 99999 22222", "variety": "IR-64",
            "cultivated_area": 5.0, "harvest_date": "2026-06-25", "slot_time": "10:00 AM"
        })

        # 3. Third farmer attempts to book on same date (exceeds 20,000 Kg daily capacity)
        res_exceed = self.client.post("/api/v1/farmers", json={
            "name": "Farmer Gamma", "mobile": "+91 99999 33333", "variety": "IR-64",
            "cultivated_area": 1.0, "harvest_date": "2026-06-25", "slot_time": "11:00 AM"
        })
        self.assertEqual(res_exceed.status_code, 400)
        self.assertIn("Daily capacity warning", res_exceed.json()["detail"])
        print("[SUCCESS] API rejected booking exceeding daily 20 tons limit on 2026-06-25.")

        # 4. Duplicate booking check
        res_dup = self.client.post("/api/v1/farmers", json={
            "name": "Farmer Alpha", "mobile": "+91 99999 11111", "variety": "IR-64",
            "cultivated_area": 2.0, "harvest_date": "2026-06-25", "slot_time": "02:00 PM"
        })
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("Duplicate booking", res_dup.json()["detail"])
        print("[SUCCESS] API correctly blocked duplicate booking for the same farmer/date.")

    def test_4_4_vehicle_assignment(self):
        print("\n--- Running Test 4.4: Vehicle Assignment ---")
        # Register a farmer (5 acres, 10 tons)
        res_f = self.client.post("/api/v1/farmers", json={
            "name": "Suresh", "mobile": "+91 92222 22222", "variety": "IR-64",
            "cultivated_area": 5.0, "harvest_date": "2026-06-25", "slot_time": "11:00 AM"
        })
        farmer_id = res_f.json()["id"]

        # 1. Assign suitable vehicle MH14CD9087 (12 ton capacity)
        res_assign = self.client.post(f"/api/v1/vehicles/MH14CD9087/assign/{farmer_id}")
        self.assertEqual(res_assign.status_code, 200)
        self.assertEqual(res_assign.json()["vehicle"]["status"], "enroute")
        print("[SUCCESS] Suitable vehicle MH14CD9087 mapped to booking.")

        # 2. Attempt to assign insufficient capacity vehicle
        # Mini truck (MH12EF3344 is registered, capacity 5000 kg capacity)
        res_bad_assign = self.client.post(f"/api/v1/vehicles/MH12EF3344/assign/{farmer_id}")
        self.assertEqual(res_bad_assign.status_code, 400)
        self.assertIn("exceeds vehicle capacity", res_bad_assign.json()["detail"])
        print("[SUCCESS] Insufficient capacity vehicle assignment was blocked.")

    def test_4_5_anpr_gate_verification(self):
        print("\n--- Running Test 4.5: ANPR Gate Verification ---")
        # Register farmer and assign vehicle
        res_f = self.client.post("/api/v1/farmers", json={
            "name": "Ramesh", "mobile": "+91 98765 43210", "variety": "Sona Masoori",
            "cultivated_area": 3.0, "harvest_date": "2026-06-25", "slot_time": "09:00 AM"
        })
        farmer_id = res_f.json()["id"]
        self.client.post(f"/api/v1/vehicles/MH14CD9087/assign/{farmer_id}")

        # 1. Registered vehicle in correct slot (allowed)
        res_verify = self.client.post("/api/v1/vehicles/gate-verify", json={
            "vehicle_id": "MH14CD9087", "confidence": 0.95
        })
        self.assertEqual(res_verify.json()["status"], "allowed")
        print("[SUCCESS] Registered vehicle MH14CD9087 allowed at correct slot.")

        # 2. Unregistered vehicle (denied)
        res_unreg = self.client.post("/api/v1/vehicles/gate-verify", json={
            "vehicle_id": "MH99ZZ9999", "confidence": 0.95
        })
        self.assertEqual(res_unreg.json()["status"], "denied")
        self.assertIn("not found in registered database", res_unreg.json()["reason"])
        print("[SUCCESS] Unregistered vehicle MH99ZZ9999 correctly denied access.")

        # 3. Low confidence OCR (manual verification required)
        res_f2 = self.client.post("/api/v1/farmers", json={
            "name": "Sita", "mobile": "+91 97654 32109", "variety": "IR-64",
            "cultivated_area": 2.0, "harvest_date": "2026-06-25", "slot_time": "11:30 AM"
        })
        farmer_id2 = res_f2.json()["id"]
        self.client.post(f"/api/v1/vehicles/MH12AB4521/assign/{farmer_id2}")

        res_blurry = self.client.post("/api/v1/vehicles/gate-verify", json={
            "vehicle_id": "MH12AB4521", "confidence": 0.55
        })
        self.assertEqual(res_blurry.json()["status"], "manual_verification")
        self.assertIn("Low plate read confidence", res_blurry.json()["reason"])
        print("[SUCCESS] Blurry / low confidence plate scan routed to manual verification.")

    def test_4_6_gunny_bag_counting(self):
        print("\n--- Running Test 4.6: Gunny Bag Counting ---")
        # Register farmer
        res_f = self.client.post("/api/v1/farmers", json={
            "name": "Ravi", "mobile": "+91 91111 11111", "variety": "Sona Masoori",
            "cultivated_area": 2.0, "harvest_date": "2026-06-25"
        })
        farmer_id = res_f.json()["id"]

        # Scan batch (100 bags expected, 96 detected -> Shortage of 4 bags)
        res_scan = self.client.post(f"/api/v1/bags/scan/{farmer_id}", json={
            "expected_bags": 100, "detected_bags": 96, "damage_pct": 0.0
        })
        self.assertEqual(res_scan.status_code, 200)
        data = res_scan.json()
        self.assertEqual(data["expected_bags"], 100)
        self.assertEqual(data["detected_bags"], 96)
        self.assertEqual(data["shortage"], 4)
        self.assertEqual(data["excess"], 0)
        print("[SUCCESS] Bag scanner counted shortage (4 bags) and matched count against booking.")

    def test_4_7_gunny_bag_damage_detection(self):
        print("\n--- Running Test 4.7: Gunny Bag Damage Detection ---")
        # Register farmer
        res_f = self.client.post("/api/v1/farmers", json={
            "name": "Ravi", "mobile": "+91 91111 11111", "variety": "Sona Masoori",
            "cultivated_area": 2.0, "harvest_date": "2026-06-25"
        })
        farmer_id = res_f.json()["id"]

        # Scan 100 bags with 8% damage (above 5% threshold)
        res_scan = self.client.post(f"/api/v1/bags/scan/{farmer_id}", json={
            "expected_bags": 100, "detected_bags": 100, "damage_pct": 8.0
        })
        data = res_scan.json()
        self.assertEqual(data["damaged"], 8)
        self.assertEqual(data["damage_pct"], 8.0)
        
        # Verify farmer status is set to alert
        res_f_check = self.client.get("/api/v1/farmers")
        farmer = next(x for x in res_f_check.json() if x["id"] == farmer_id)
        self.assertEqual(farmer["status"], "alert")
        print("[SUCCESS] Damage rate (8%) above threshold triggered farmer quality alert status.")

    def test_4_8_warehouse_stock_update(self):
        print("\n--- Running Test 4.8: Warehouse Stock Update ---")
        # Register farmer with variety Sona Masoori
        res_f = self.client.post("/api/v1/farmers", json={
            "name": "Ramesh", "mobile": "+91 98765 43210", "variety": "Sona Masoori",
            "cultivated_area": 3.0, "harvest_date": "2026-06-25"
        })
        farmer_id = res_f.json()["id"]
        
        # Scan batch (120 total)
        res_scan = self.client.post(f"/api/v1/bags/scan/{farmer_id}", json={
            "expected_bags": 120, "detected_bags": 120, "damage_pct": 5.0, "open_leaking": 2
        })
        scan_data = res_scan.json()
        batch_id = scan_data["id"]
        expected_good_kg = scan_data["good"] * 50.0
        expected_bad_kg = (scan_data["damaged"] + scan_data["wet"]) * 50.0
        
        # Get baseline stocks
        res_stock_pre = self.client.get("/api/v1/warehouse/stock")
        stock_a_pre = next(s for s in res_stock_pre.json() if s["zone"] == "A")["qty_kg"]
        
        # Approve the batch (unloads and updates ledger/stocks)
        res_approve = self.client.patch(f"/api/v1/bags/batches/{batch_id}/status", json={"status": "Approved"})
        self.assertEqual(res_approve.status_code, 200)
        
        # Get updated stocks
        res_stock_post = self.client.get("/api/v1/warehouse/stock")
        stock_a_post = next(s for s in res_stock_post.json() if s["zone"] == "A")["qty_kg"]
        stock_d_post = next(s for s in res_stock_post.json() if s["zone"] == "D")["qty_kg"]
        
        # Good stock change
        self.assertEqual(stock_a_post - stock_a_pre, expected_good_kg)
        # Damaged stock change
        self.assertEqual(stock_d_post, expected_bad_kg)
        print("[SUCCESS] Stock updated dynamically. Good bags added to Zone A, damaged segregated in Zone D.")

    def test_4_9_rainfall_alert(self):
        print("\n--- Running Test 4.9: Rainfall Alert ---")
        # 1. 85% rain risk
        res_rain = self.client.get("/api/v1/weather?rain_risk=85.0")
        yard_c = next(y for y in res_rain.json()["yards"] if y["name"] == "Yard C")
        self.assertEqual(yard_c["status"], "danger")
        self.assertIn("Stop unloading", yard_c["description"])
        print("[SUCCESS] Critical rain risk (85%) triggered danger alert on Open Yard C.")

        # 2. 20% rain risk
        res_dry = self.client.get("/api/v1/weather?rain_risk=20.0")
        yard_c_dry = next(y for y in res_dry.json()["yards"] if y["name"] == "Yard C")
        self.assertEqual(yard_c_dry["status"], "caution") # Monitor actions
        print("[SUCCESS] Lower rain risk (20%) does not trigger critical danger alert.")

    def test_4_10_sms_notification_simulation(self):
        print("\n--- Running Test 4.10: SMS Notification Simulation ---")
        # Register farmer (sends Queue Registration SMS)
        res_f = self.client.post("/api/v1/farmers", json={
            "name": "Sita Devi", "mobile": "+91 97654 32109", "variety": "IR-64",
            "cultivated_area": 2.5, "harvest_date": "2026-06-25", "slot_time": "11:30 AM"
        })
        farmer_id = res_f.json()["id"]

        # Assign vehicle (sends Vehicle Assignment SMS)
        self.client.post(f"/api/v1/vehicles/MH12AB4521/assign/{farmer_id}")
        
        # Verify SMS log entries
        res_sms = self.client.get("/api/v1/sms/log")
        logs = res_sms.json()
        
        # Check that Sita Devi SMS records are stored in log
        sita_logs = [l for l in logs if l["recipient"] == "Sita Devi"]
        self.assertGreater(len(sita_logs), 0)
        print("[SUCCESS] Slot booking and vehicle assignment triggered SMS log records for Sita Devi.")

if __name__ == "__main__":
    unittest.main()
