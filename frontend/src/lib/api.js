"use client";

import axios from "axios";

/* =========================================================
ENV CONFIG
========================================================= */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/* =========================================================
AXIOS INSTANCE
========================================================= */

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  timeout: 15000,
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

export const gateVerify = async (data) => {
  const response = await api.post("/vehicles/gate-verify", data);
  return response.data;
};

export const resetSimulatorDB = async () => {
  const response = await api.post("/vehicles/reset-simulator");
  return response.data;
};

/* =========================================================
SMS
========================================================= */

export const getSMSLog = async () => {
  const response = await api.get("/sms/log");
  return response.data;
};

export const sendSMS = async (data) => {
  const response = await api.post("/sms/send", data);
  return response.data;
};

export const sendBulkSMS = async (type) => {
  const response = await api.post("/sms/bulk", { type });
  return response.data;
};

export const sendRainAlert = async () => {
  const response = await api.post("/sms/rain-alert");
  return response.data;
};

/* =========================================================
EMAIL
========================================================= */

export const getEmailLog = async () => {
  const response = await api.get("/email/log");
  return response.data;
};

export const sendEmail = async (data) => {
  const response = await api.post("/email/send", data);
  return response.data;
};

export const sendBulkEmail = async (type) => {
  const response = await api.post("/email/bulk", { type });
  return response.data;
};

export const sendRainAlertEmail = async () => {
  const response = await api.post("/email/rain-alert");
  return response.data;
};

/* =========================================================
REPORTS
========================================================= */

export const downloadReport = (type) =>
  `${API_URL}/api/v1/reports/${type}/download`;

export const getWeeklySummary = async () => {
  const response = await api.get("/reports/weekly-summary");
  return response.data;
};

/* =========================================================
   DATASETS
========================================================= */

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
  const response = await api.post("/dashboard/dataset/upload", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
};

/* =========================================================
EXPORTS
========================================================= */

export { api, API_URL, SUPABASE_URL };
export default api;

