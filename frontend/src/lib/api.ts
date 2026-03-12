import axios from "axios";
import type { AxiosRequestConfig, AxiosResponse } from "axios";

export const api = axios.create({
  baseURL: "https://api.king11pro.live/api/v1",
  withCredentials: true,
});

type CacheOption = false | { ttlMs?: number; key?: string };
interface CacheRequestConfig<T = any> extends AxiosRequestConfig<T> {
  cache?: CacheOption;
}

interface CacheEntry {
  data: any;
  expiresAt: number;
}

const DEFAULT_CACHE_TTL_MS = 20_000;
const responseCache = new Map<string, CacheEntry>();
const inflightGet = new Map<string, Promise<AxiosResponse>>();

const buildCacheKey = (url: string, config?: AxiosRequestConfig): string => {
  const params = config?.params ? JSON.stringify(config.params) : "";
  return `${url}::${params}`;
};

export const clearApiCache = (): void => {
  responseCache.clear();
  inflightGet.clear();
};

export const invalidateApiCache = (keyPrefix: string): void => {
  for (const key of responseCache.keys()) {
    if (key.startsWith(keyPrefix)) responseCache.delete(key);
  }
};

const rawGet = api.get.bind(api);
api.get = (async (url: string, config?: CacheRequestConfig): Promise<AxiosResponse> => {
  const cacheOpt = config?.cache;
  if (cacheOpt === false) {
    return rawGet(url, config);
  }

  const customKey = typeof cacheOpt === "object" ? cacheOpt.key : undefined;
  const ttlMs = typeof cacheOpt === "object" && cacheOpt.ttlMs !== undefined
    ? cacheOpt.ttlMs
    : DEFAULT_CACHE_TTL_MS;

  const key = customKey ?? buildCacheKey(url, config);
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > now) {
    return {
      data: cached.data,
      status: 200,
      statusText: "OK",
      headers: {},
      config: (config ?? {}) as any,
    } as AxiosResponse;
  }

  const existing = inflightGet.get(key);
  if (existing) return existing;

  const req = rawGet(url, config)
    .then((res) => {
      responseCache.set(key, {
        data: res.data,
        expiresAt: Date.now() + ttlMs,
      });
      return res;
    })
    .finally(() => {
      inflightGet.delete(key);
    });

  inflightGet.set(key, req);
  return req;
}) as typeof api.get;

// User token getter — registered after user store initialises.
let getUserToken: () => string | null = () => null;

export function registerTokenGetter(fn: () => string | null) {
  getUserToken = fn;
}

api.interceptors.request.use((config) => {
  const token = getUserToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use((response) => {
  const method = response.config?.method?.toUpperCase();
  if (method && method !== "GET") {
    clearApiCache();
  }
  return response;
});