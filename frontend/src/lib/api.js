"use client";

import axios from "axios";

/* =========================================================
ENV CONFIG
========================================================= */

const normalizeApiOrigin = (value) => {
  const trimmed = value?.trim() || "";
  if (!trimmed) return "http://127.0.0.1:8000";
  return trimmed.replace(/\/api\/v1\/?$/, "").replace(/\/$/, "");
};

const API_URL = normalizeApiOrigin(process.env.NEXT_PUBLIC_API_URL);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const API_BASE_URL = `${API_URL}/api/v1`;

/* =========================================================
AXIOS INSTANCE
========================================================= */

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/* =========================================================
REQUEST INTERCEPTOR
========================================================= */

api.interceptors.request.use(
  (config) => config,
  (error) => Promise.reject(error),
);

/* =========================================================
RESPONSE INTERCEPTOR
========================================================= */

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API ERROR:", error?.response?.data || error.message);
    return Promise.reject(error);
  },
);

/* =========================================================
DASHBOARD
========================================================= */

export const getDashboardKPIs = async () => {
  const response = await api.get("/dashboard/kpis");
  return response.data;
};

export const getAlerts = async () => {
  const response = await api.get("/dashboard/alerts");
  return response.data;
};

export const retrainAIModels = async () => {
  const response = await api.post("/dashboard/retrain");
  return response.data;
};

export const getModelTraining = async () => {
  const response = await api.get("/dashboard/model-training");
  return response.data;
};

export const getDataset = async () => {
  const response = await api.get("/dashboard/dataset");
  return response.data;
};

export const addDatasetRecord = async (data) => {
  const response = await api.post("/dashboard/dataset", data);
  return response.data;
};

export const uploadDatasetCsv = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/dashboard/upload-dataset", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

/* =========================================================
FARMERS
========================================================= */

export const getFarmers = async () => {
  const response = await api.get("/farmers");
  return response.data;
};

export const createFarmer = async (data) => {
  const response = await api.post("/farmers", data);
  return response.data;
};

export const predictFarmer = async (data) => {
  const response = await api.post("/farmers/predict", data);
  return response.data;
};

export const updateFarmerStatus = async (id, status) => {
  const response = await api.patch(`/farmers/${id}/status`, { status });
  return response.data;
};

export const deleteFarmer = async (id) => {
  await api.delete(`/farmers/${id}`);
};

/* =========================================================
BAGS
========================================================= */

export const getBatches = async () => {
  const response = await api.get("/bags/batches");
  return response.data;
};

export const scanBatch = async (farmerId, data = null) => {
  const response = await api.post(`/bags/scan/${farmerId}`, data);
  return response.data;
};

export const updateBatchStatus = async (batchId, status) => {
  const response = await api.patch(`/bags/batches/${batchId}/status`, { status });
  return response.data;
};

export const scanBatchMedia = async (farmerId, { bagMediaFile, damageImageFiles = [], expectedBags } = {}) => {
  const formData = new FormData();
  formData.append("bag_media", bagMediaFile);
  damageImageFiles.forEach((f) => formData.append("damage_images", f));
  if (expectedBags !== undefined && expectedBags !== null) {
    formData.append("expected_bags", expectedBags);
  }
  const response = await api.post(`/bags/scan-media/${farmerId}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

/* =========================================================
WAREHOUSE
========================================================= */

export const getStock = async () => {
  const response = await api.get("/warehouse/stock");
  return response.data;
};

export const getZones = async () => {
  const response = await api.get("/warehouse/zones");
  return response.data;
};

export const getLedger = async () => {
  const response = await api.get("/warehouse/ledger");
  return response.data;
};

export const addStockEntry = async (data) => {
  const response = await api.post("/warehouse/ledger", data);
  return response.data;
};

export const deleteStockEntry = async (id) => {
  const response = await api.delete(`/warehouse/ledger/${id}`);
  return response.data;
};

/* =========================================================
WEATHER
========================================================= */

export const getWeather = async (params = {}) => {
  const response = await api.get("/weather", { params });
  return response.data;
};

export const updateChecklist = async (id, done) => {
  await api.patch(`/weather/checklist/${id}`, { done });
};

/* =========================================================
VEHICLES
========================================================= */

export const getVehicles = async () => {
  const response = await api.get("/vehicles");
  return response.data;
};

export const createVehicle = async (data) => {
  const response = await api.post("/vehicles", data);
  return response.data;
};

export const updateVehicle = async (id, data) => {
  const response = await api.patch(`/vehicles/${id}`, data);
  return response.data;
};

export const cancelVehicleBooking = async (id) => {
  const response = await api.post(`/vehicles/${id}/cancel`);
  return response.data;
};

export const autoScheduleVehicles = async () => {
  const response = await api.post("/vehicles/auto-schedule");
  return response.data;
};

export const assignVehicle = async (vehicleId, farmerId) => {
  const response = await api.post(`/vehicles/${vehicleId}/assign/${farmerId}`);
  return response.data;
};

export const simulateGateVerify = async (data) => {
  const response = await api.post("/vehicles/gate-verify-workflow", data);
  return response.data;
};

export const gateVerify = async (imageFile, { expectedVehicleId, bookingFarmerId } = {}) => {
  const formData = new FormData();
  formData.append("image", imageFile);
  if (expectedVehicleId) formData.append("expected_vehicle_id", expectedVehicleId);
  if (bookingFarmerId) formData.append("booking_farmer_id", bookingFarmerId);

  const response = await api.post("/vehicles/gate-verify", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const resetSimulatorDB = async () => {
  const response = await api.post("/vehicles/reset-simulator");
  return response.data;
};

/* =========================================================
REPORTS & SMS
========================================================= */

export const sendSMS = async (data) => {
  const response = await api.post("/sms/send", data);
  return response.data;
};

export const getSMSLog = async () => {
  const response = await api.get("/sms/log");
  return response.data;
};

export const getSMSLogs = getSMSLog;

export const sendBulkSMS = async (data = { type: "queue" }) => {
  const response = await api.post("/sms/bulk", data);
  return response.data;
};

export const sendRainAlert = async () => {
  const response = await api.post("/sms/rain-alert");
  return response.data;
};

export const sendRainAlertEmail = sendRainAlert;

export const getReportSummary = async () => {
  const response = await api.get("/reports/summary");
  return response.data;
};

export const getWeeklySummary = async () => {
  const response = await api.get("/reports/weekly-summary");
  return response.data;
};

export const downloadReport = (type) => {
  return `${API_BASE_URL}/reports/${type}/download`;
};

export default api;
