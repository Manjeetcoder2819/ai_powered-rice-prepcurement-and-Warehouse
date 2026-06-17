import api from "./api";

export const getVarietyPrices = async () => {
  const response = await api.get("/prices");
  return response.data;
};

export const saveVarietyPrice = async (data) => {
  const response = await api.post("/prices", data);
  return response.data;
};

export const getPriceSummary = async () => {
  const response = await api.get("/prices/summary");
  return response.data;
};
