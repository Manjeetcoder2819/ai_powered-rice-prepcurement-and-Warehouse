/* =========================================================
FARMER & QUEUE
========================================================= */

export const FARMER_STATUS = {
WAITING: 'waiting',
PROCESSING: 'processing',
DONE: 'done',
ALERT: 'alert',
}

/* =========================================================
BATCH
========================================================= */

export const BATCH_STATUS = {
GOOD: 'good',
DAMAGED: 'damaged',
WET: 'wet',
}

/* =========================================================
WAREHOUSE
========================================================= */

export const ZONE_STATUS = {
SAFE: 'safe',
WARN: 'warn',
DANGER: 'danger',
}

/* =========================================================
WEATHER
========================================================= */

export const YARD_STATUS = {
SAFE: 'safe',
CAUTION: 'caution',
DANGER: 'danger',
}

export const CHECKLIST_PRIORITY = {
HIGH: 'high',
MED: 'med',
}

/* =========================================================
VEHICLES
========================================================= */

export const VEHICLE_STATUS = {
ENROUTE: 'enroute',
STANDBY: 'standby',
OFFLINE: 'offline',
}

/* =========================================================
SMS
========================================================= */

export const SMS_TYPES = {
QUEUE: 'queue',
DAMAGE: 'damage',
RAIN: 'rain',
VEHICLE: 'vehicle',
COMPLETE: 'complete',
BROADCAST: 'broadcast',
}

export const SMS_STATUS = {
DELIVERED: 'delivered',
PENDING: 'pending',
FAILED: 'failed',
}

/* =========================================================
ALERTS
========================================================= */

export const ALERT_TYPES = {
RAINFALL: 'rainfall',
SMS: 'sms',
DAMAGE: 'damage',
VEHICLE: 'vehicle',
STOCK: 'stock',
}

export const ALERT_SEVERITY = {
INFO: 'info',
WARNING: 'warning',
ERROR: 'error',
}

/* =========================================================
DEFAULT OBJECTS
========================================================= */

export const DEFAULT_FARMER = {
id: 0,
token: '',
name: '',
mobile: '',
village: '',
aadhaar_last4: '',
variety: '',
bags: 0,
arrived_at: '',
status: FARMER_STATUS.WAITING,
wait_minutes: 0,
notes: '',
}

export const DEFAULT_BATCH = {
id: '',
farmer_name: '',
farmer_mobile: '',
total_bags: 0,
good: 0,
damaged: 0,
wet: 0,
damaged_indices: [],
wet_indices: [],
deduction_amount: 0,
scanned_at: '',
}

export const DEFAULT_STOCK = {
variety: '',
qty_mt: 0,
capacity_mt: 0,
zone: '',
color: '',
}

export const DEFAULT_ZONE = {
id: '',
name: '',
variety: '',
pct: 0,
temp_c: 0,
status: ZONE_STATUS.SAFE,
label: '',
}

export const DEFAULT_LEDGER = {
id: 0,
time: '',
variety: '',
qty_mt: 0,
zone: '',
type: 'Inflow',
operator: '',
}

export const DEFAULT_WEATHER = {
temp_c: 0,
description: '',
humidity: 0,
wind_kmh: 0,
rain_risk_pct: 0,
forecast: [],
yards: [],
checklist: [],
}

export const DEFAULT_VEHICLE = {
id: '',
route: '',
load: '',
driver: '',
driver_mobile: '',
progress_pct: 0,
status: VEHICLE_STATUS.STANDBY,
schedule_time: '',
}

export const DEFAULT_SMS = {
id: 0,
type: SMS_TYPES.QUEUE,
recipient: '',
mobile: '',
message: '',
sent_at: '',
status: SMS_STATUS.PENDING,
}

export const DEFAULT_ALERT = {
id: 0,
type: ALERT_TYPES.RAINFALL,
title: '',
description: '',
time: '',
severity: ALERT_SEVERITY.INFO,
}

export const DEFAULT_DASHBOARD_KPIS = {
farmers_in_queue: 0,
farmers_delta: 0,
rice_procured_mt: 0,
rice_delta_pct: 0,
bags_counted: 0,
bags_today: 0,
damaged_bags: 0,
damaged_pct: 0,
warehouse_stock_mt: 0,
warehouse_capacity_mt: 0,
warehouse_pct: 0,
alerts_today: 0,
}
