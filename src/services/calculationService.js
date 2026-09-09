import api from "./api";

export const getCalculationBootstrap = async () => {
  const res = await api.get("/calculations/bootstrap");
  return res.data;
};

export const getDutyCalculations = async (page = 1) => {
  const res = await api.get("/calculations/duties", { params: { page } });
  return res.data;
};

export const getDutyCalculation = async (id) => {
  const res = await api.get(`/calculations/duties/${id}`);
  return res.data;
};

export const createDutyCalculation = async (payload) => {
  const res = await api.post("/calculations/duties", payload);
  return res.data;
};

export const updateDutyCalculation = async (id, payload) => {
  const res = await api.put(`/calculations/duties/${id}`, payload);
  return res.data;
};

export const markDutyBillReceived = async (id, received = true) => {
  const res = await api.patch(`/calculations/duties/${id}/received`, { received });
  return res.data;
};

export const updateCalculationSettings = async (payload) => {
  const res = await api.put("/calculations/settings", payload);
  return res.data;
};
