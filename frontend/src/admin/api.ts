import axios from "axios";

export const api = axios.create({
  baseURL: "https://api.king11pro.live/api/v1",
  withCredentials: true,
});

let getAdminToken: () => string | null = () => null;

export function registerAdminTokenGetter(fn: () => string | null) {
  getAdminToken = fn;
}

api.interceptors.request.use((config) => {
  const token = getAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});