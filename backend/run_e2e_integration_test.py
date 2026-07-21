import os
import sys
import asyncio
from pathlib import Path

# Setup environment variable to use test database
os.environ["TESTING"] = "1"

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
sys.path.append(str(backend_dir))

from fastapi.testclient import TestClient
from app.main import app
from app.core.database import AsyncSessionLocal, create_tables, seed_database
from sqlalchemy import select
from app.models.farmer import FarmerModel
from app.models.vehicle import VehicleModel
from app.models.bags import BatchModel
from app.models.warehouse import StockModel, LedgerModel
from app.models.sms_log import SMSLogModel

def run_async(coro):
    return asyncio.get_event_loop().run_until_complete(coro)

def run_e2e_test():
    client = TestClient(app)
    
    # 0. Initialize fresh database
    print("\n[E2E] Step 0: Initializing fresh database...")
    run_async(create_tables())
    
    # Clean all tables to avoid unique constraint conflicts on seeding
    from sqlalchemy import delete
    from app.models.price import VarietyPriceModel
    from app.models.weather import ChecklistModel
    from app.models.warehouse import ZoneModel
    async def clean_all():
        async with AsyncSessionLocal() as db:
            await db.execute(delete(FarmerModel))
            await db.execute(delete(BatchModel))
            await db.execute(delete(LedgerModel))
            await db.execute(delete(SMSLogModel))
            await db.execute(delete(VehicleModel))
            await db.execute(delete(StockModel))
            await db.execute(delete(ZoneModel))
            await db.execute(delete(VarietyPriceModel))
            await db.execute(delete(ChecklistModel))
            await db.commit()
    run_async(clean_all())
    run_async(seed_database())
    
    # Clean only seeded farmers, batches, and SMS logs so we start with 0 Kg capacity booked on 2026-06-25
    async def clean_farmers():
        async with AsyncSessionLocal() as db:
            await db.execute(delete(FarmerModel))
            await db.execute(delete(BatchModel))
            await db.execute(delete(SMSLogModel))
            await db.commit()
    run_async(clean_farmers())
    print("[E2E] Database initialized, seeded, and ready for 2026-06-25 slot checks.")

    # 1. Register farmer Ravi
    print("\n[E2E] Step 1: Registering farmer Ravi...")
    register_payload = {
        "name": "Ravi",
        "mobile": "+91 91111 11111",
        "village": "Sanaswadi",
        "aadhaar_last4": "1111",
        "variety": "Paddy",
        "bags": 80,
        "cultivated_area": 2.0,
        "harvest_date": "2026-06-25",
        "slot_date": "2026-06-25",
        "slot_time": "09:00 AM"
    }
    res_register = client.post("/api/v1/farmers", json=register_payload)
    assert res_register.status_code == 200, f"Registration failed: {res_register.text}"
    farmer = res_register.json()
    farmer_id = farmer["id"]
    print(f"[E2E] Farmer Ravi registered. ID: {farmer_id}, Yield: {farmer['predicted_yield_kg']} Kg, Recommended Vehicle: {farmer['recommended_vehicle']}")

    # 2. Book Go-down G1 slot at 09:00 AM
    print("\n[E2E] Step 2: Verifying slot booking at 09:00 AM...")
    assert farmer["slot_time"] == "09:00 AM"
    print(f"[E2E] Slot successfully booked for G1/Bay at {farmer['slot_time']}.")

    # 3. Create and assign vehicle MH12AB4567
    print("\n[E2E] Step 3: Registering and assigning vehicle MH12AB4567...")
    vehicle_payload = {
        "id": "MH12AB4567",
        "driver": "Baldev Singh",
        "driver_mobile": "+91 99887 76655",
        "status": "standby"
    }
    res_vehicle = client.post("/api/v1/vehicles", json=vehicle_payload)
    assert res_vehicle.status_code == 200, f"Vehicle registration failed: {res_vehicle.text}"
    
    res_assign = client.post(f"/api/v1/vehicles/MH12AB4567/assign/{farmer_id}")
    assert res_assign.status_code == 200, f"Vehicle assignment failed: {res_assign.text}"
    assignment_data = res_assign.json()
    print(f"[E2E] Vehicle assigned successfully. Status: {assignment_data['vehicle']['status']}, Driver: {assignment_data['vehicle']['driver']}")

    # 4. Trigger gate verification (matches booking)
    print("\n[E2E] Step 4: Simulating gate verification (ANPR plate match)...")
    gate_payload = {
        "vehicle_id": "MH12AB4567",
        "confidence": 0.95
    }
    res_gate = client.post("/api/v1/vehicles/gate-verify", json=gate_payload)
    assert res_gate.status_code == 200, f"Gate verification failed: {res_gate.text}"
    gate_data = res_gate.json()
    assert gate_data["status"] == "allowed", f"Expected allowed status but got: {gate_data['status']}"
    print(f"[E2E] Gate access: {gate_data['status'].upper()}. Reason: {gate_data['reason']}")

    # 5. Upload unloading bag scan: expected 80, detected 78, shortage 2
    # 6. Record damaged bags (damage_pct = 5% -> ~4 bags, open_leaking = 2)
    print("\n[E2E] Step 5 & 6: Uploading bag scan details (Expected: 80, Detected: 78, Shortage: 2, Defect details)...")
    scan_payload = {
        "expected_bags": 80,
        "detected_bags": 78,
        "damage_pct": 5.0,
        "open_leaking": 2
    }
    res_scan = client.post(f"/api/v1/bags/scan/{farmer_id}", json=scan_payload)
    assert res_scan.status_code == 200, f"Bag scan failed: {res_scan.text}"
    scan_data = res_scan.json()
    batch_id = scan_data["id"]
    assert scan_data["expected_bags"] == 80
    assert scan_data["detected_bags"] == 78
    assert scan_data["shortage"] == 2
    print(f"[E2E] Live scanner results: Good: {scan_data['good']}, Damaged: {scan_data['damaged']}, Wet: {scan_data['wet']}. Deduction: Rs.{scan_data['deduction_amount']}")

    # Get stock baseline for damaged stock Zone D
    res_stock_pre = client.get("/api/v1/warehouse/stock")
    stock_d_pre = next((s["qty_kg"] for s in res_stock_pre.json() if s["zone"] == "D"), 0.0)

    # 7. Confirm unloading (Approve batch status)
    print("\n[E2E] Step 7: Confirming unloading and finalizing procurement...")
    res_approve = client.patch(f"/api/v1/bags/batches/{batch_id}/status", json={"status": "Approved"})
    assert res_approve.status_code == 200, f"Approval failed: {res_approve.text}"
    approved_data = res_approve.json()
    assert approved_data["status"] == "Approved"
    print("[E2E] Unloading approved and finalized.")

    # 8. Verify post-procurement state updates
    print("\n[E2E] Step 8: Verifying system state updates...")
    
    # 8.1 Farmer booking status becomes Completed ('done')
    res_farmers = client.get("/api/v1/farmers")
    farmer_post = next(f for f in res_farmers.json() if f["id"] == farmer_id)
    assert farmer_post["status"] == "done", f"Expected 'done' but got: {farmer_post['status']}"
    print("[E2E] Farmer status successfully updated to 'done' (Completed).")

    # 8.2 Stock updates (Zone D quarantine stock increases)
    res_stock_post = client.get("/api/v1/warehouse/stock")
    stock_d_post = next((s["qty_kg"] for s in res_stock_post.json() if s["zone"] == "D"), 0.0)
    expected_bad_kg = (scan_data["damaged"] + scan_data["wet"]) * 50.0
    assert stock_d_post - stock_d_pre == expected_bad_kg
    print(f"[E2E] Stock updated. Quarantine Zone D stock increased by {expected_bad_kg} Kg.")

    # 8.3 SMS log contains messages for Ravi
    res_sms = client.get("/api/v1/sms/log")
    logs = res_sms.json()
    ravi_logs = [l for l in logs if l["recipient"] == "Ravi"]
    assert len(ravi_logs) > 0, "No SMS generated for Ravi"
    print(f"[E2E] SMS logs generated successfully. Message count for Ravi: {len(ravi_logs)}")
    
    # 8.4 Dashboard values are populated
    res_dash = client.get("/api/v1/dashboard/kpis")
    assert res_dash.status_code == 200
    print("[E2E] Dashboard KPIs retrieve successfully.")
    
    print("\n=======================================================")
    print("[SUCCESS] END-TO-END INTEGRATION TEST PASSED SUCCESSFULLY!")
    print("=======================================================")

if __name__ == "__main__":
    run_e2e_test()
