import os
import sys
from pathlib import Path

# Setup environment variable before imports
os.environ["TESTING"] = "1"

# Add backend to path
backend_dir = Path(__file__).resolve().parent
sys.path.append(str(backend_dir))

import unittest
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import AsyncSessionLocal
from sqlalchemy import select, update
from app.models.farmer import FarmerModel
from app.models.vehicle import VehicleModel
import asyncio

# Helper to run async code inside sync unittest
def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

class TestRiceProcurementSystem(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        from app.core.database import create_tables, seed_database
        run_async(create_tables())
        run_async(seed_database())

    def setUp(self):
        # Reset database state before each test to ensure consistency
        run_async(self.reset_db())

    async def reset_db(self):
        async with AsyncSessionLocal() as db:
            # Reset existing bookings/farmers to clean state
            from sqlalchemy import delete
            await db.execute(delete(FarmerModel))
            
            # Reset demo vehicles
            await db.execute(
                update(VehicleModel)
                .where(VehicleModel.vehicle_id == "MH14CD9087")
                .values(status="standby", route="", load="", progress_pct=0)
            )
            await db.execute(
                update(VehicleModel)
                .where(VehicleModel.vehicle_id == "MH12AB4521")
                .values(status="standby", route="", load="", progress_pct=0)
            )
            await db.commit()

    def test_T01_ravi_slot_booked(self):
        """T01: Ravi, 2 acres, 4 tons, Mini truck -> Slot booked"""
        payload = {
            "name": "Ravi",
            "mobile": "+91 91111 11111",
            "village": "Village A",
            "aadhaar_last4": "1111",
            "variety": "Sona Masoori",
            "bags": 80,
            "cultivated_area": 2.0,
            "harvest_date": "2026-06-25",
            "slot_date": "2026-06-25",
            "slot_time": "09:00 AM"
        }
        response = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "Ravi")
        self.assertEqual(data["predicted_yield_kg"], 4000.0) # 4 tons
        self.assertEqual(data["recommended_vehicle"], "Mini truck")
        self.assertEqual(data["status"], "waiting")

    def test_T02_suresh_vehicle_assigned(self):
        """T02: Suresh, 5 acres, 10 tons, Medium truck -> Vehicle assigned"""
        # 1. Register Suresh
        payload = {
            "name": "Suresh",
            "mobile": "+91 92222 22222",
            "village": "Village B",
            "aadhaar_last4": "2222",
            "variety": "IR-64",
            "bags": 200,
            "cultivated_area": 5.0,
            "harvest_date": "2026-06-25",
            "slot_date": "2026-06-25",
            "slot_time": "11:00 AM"
        }
        res_register = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(res_register.status_code, 200)
        farmer_id = res_register.json()["id"]
        
        # 2. Assign Vehicle MH14CD9087 (Capacity matches Suresh's 10 tons/10000kg)
        res_assign = self.client.post(f"/api/v1/vehicles/MH14CD9087/assign/{farmer_id}")
        self.assertEqual(res_assign.status_code, 200)
        data = res_assign.json()
        self.assertEqual(data["vehicle"]["status"], "enroute")
        self.assertEqual(data["farmer"]["assigned_vehicle"], "MH14CD9087")

    def test_T03_kumar_capacity_slot(self):
        """T03: Kumar, 10 acres, 20 tons, Large truck -> Capacity-based slot scheduling"""
        # Register Kumar on a fresh harvest date (since Ravi+Suresh exceed 20,000kg daily limit)
        payload = {
            "name": "Kumar",
            "mobile": "+91 93333 33333",
            "village": "Village C",
            "aadhaar_last4": "3333",
            "variety": "Basmati",
            "bags": 400,
            "cultivated_area": 10.0,
            "harvest_date": "2026-06-26", # Fresh slot date
            "slot_date": "2026-06-26",
            "slot_time": "02:00 PM"
        }
        response = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "Kumar")
        self.assertEqual(data["predicted_yield_kg"], 20000.0) # 20 tons
        self.assertEqual(data["recommended_vehicle"], "Large truck")

    def test_T04_late_farmer_slot_mismatch(self):
        """T04: Late farmer, 3 acres, 6 tons -> Slot mismatch warning at gate"""
        # 1. Register Late Farmer (scheduled for yesterday)
        payload = {
            "name": "Late farmer",
            "mobile": "+91 94444 44444",
            "village": "Village D",
            "aadhaar_last4": "4444",
            "variety": "HMT",
            "bags": 120,
            "cultivated_area": 3.0,
            "harvest_date": "2026-06-24", # Scheduled for yesterday
            "slot_date": "2026-06-24",
            "slot_time": "04:00 PM"
        }
        res_register = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(res_register.status_code, 200)
        farmer_id = res_register.json()["id"]
        
        # 2. Assign Vehicle MH14CD9087
        res_assign = self.client.post(f"/api/v1/vehicles/MH14CD9087/assign/{farmer_id}")
        self.assertEqual(res_assign.status_code, 200)
        
        # 3. Trigger Gate OCR Verification (without override flag)
        # Should return wrong_slot warning
        verify_payload = {
            "vehicle_id": "MH14CD9087",
            "confidence": 0.95,
            "override": False
        }
        res_verify = self.client.post("/api/v1/vehicles/gate-verify", json=verify_payload)
        self.assertEqual(res_verify.status_code, 200)
        data = res_verify.json()
        self.assertEqual(data["status"], "wrong_slot")
        self.assertIn("Wrong slot date", data["reason"])

    def test_T05_invalid_farmer_validation_error(self):
        """T05: Invalid farmer, 0 acres -> Validation Error"""
        payload = {
            "name": "Invalid farmer",
            "mobile": "+91 95555 55555",
            "village": "Village E",
            "aadhaar_last4": "5555",
            "variety": "Swarna",
            "bags": 0,
            "cultivated_area": 0.0, # Invalid area
            "harvest_date": "2026-06-25"
        }
        response = self.client.post("/api/v1/farmers", json=payload)
        self.assertEqual(response.status_code, 400)
        data = response.json()
        self.assertIn("Cultivated area must be a positive number", data["detail"])

if __name__ == "__main__":
    unittest.main()
