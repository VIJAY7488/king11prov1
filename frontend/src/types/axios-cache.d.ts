import "axios";

declare module "axios" {
  interface AxiosRequestConfig<D = any> {
    cache?: false | { ttlMs?: number; key?: string };
  }
}