export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: unknown;

  constructor(
    message: string,
    code: string = "API_ERROR",
    status: number = 500,
    details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = endpoint.startsWith("http") ? endpoint : endpoint;

  const defaultHeaders: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  // Attach stored user auth headers for bulletproof cross-origin / reverse-proxy session support
  try {
    const rawUser = localStorage.getItem("reachinbox_user");
    if (rawUser) {
      const parsed = JSON.parse(rawUser);
      if (parsed?.id) {
        defaultHeaders["X-User-Id"] = parsed.id;
        defaultHeaders["Authorization"] = `Bearer ${parsed.id}`;
      }
    }
  } catch {}

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...defaultHeaders,
      ...(options.headers as Record<string, string>),
    },
  });

  const contentType = response.headers.get("content-type");
  let data: any = null;

  if (contentType && contentType.includes("application/json")) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      data?.error?.message ||
      data?.message ||
      `Request failed with status ${response.status}`;
    const errorCode = data?.error?.code || "REQUEST_FAILED";
    const errorDetails = data?.error?.details || data?.details;
    throw new ApiError(errorMsg, errorCode, response.status, errorDetails);
  }

  return (data?.data !== undefined ? data.data : data) as T;
}
