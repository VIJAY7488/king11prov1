import axios from "axios";

export function getErrorMessage(error: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: string } | undefined;
    const raw = data?.message ?? data?.error ?? "";
    const genericAxiosMsg = /^Request failed with status code \d{3}$/i.test(raw);

    if (raw && !genericAxiosMsg) return raw;

    const status = error.response?.status;
    if (status === 400) return "Invalid request. Please check your input and try again.";
    if (status === 401) return "You need to login again.";
    if (status === 403) return "You are not allowed to perform this action.";
    if (status === 404) return "Requested data was not found.";
    if (status === 409) return "This action already exists or conflicts with current data.";
    if (status === 422) return "Submitted data is invalid.";
    if (status === 429) return "Too many requests. Please try again in a moment.";
    if (status && status >= 500) return "Server error. Please try again shortly.";

    return error.message && !genericAxiosMsg ? error.message : fallback;
  }

  if (error instanceof Error) return error.message || fallback;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}