import api from "./api";

export const getMyRoutine = async () => {
  const res = await api.get("/routine/my");
  return res.data;
};

export const saveMyRoutine = async (payload) => {
  const res = await api.put("/routine/my", payload);
  return res.data;
};
