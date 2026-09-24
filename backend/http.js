export class HttpError extends Error {
  constructor(message, status = 400, code = "request_error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const json = (data, status = 200, extraHeaders = {}) => new Response(JSON.stringify(data), {
  status,
  headers: {"Content-Type":"application/json", "Cache-Control":"no-store", ...extraHeaders}
});

export async function bodyJSON(request, maxBytes = 1024 * 1024) {
  if (!(request.headers.get("Content-Type") || "").includes("application/json")) {
    throw new HttpError("Use application/json.", 415, "content_type");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new HttpError("Request is too large.", 413, "too_large");
  try { return JSON.parse(text); } catch { throw new HttpError("Invalid JSON.", 400, "invalid_json"); }
}

export const id = prefix => `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
export const now = () => Date.now();
export const clean = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
export const validEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value, 254));

export function errorResponse(error) {
  if (error instanceof HttpError) return json({error:error.message, code:error.code}, error.status);
  console.error("MREO API error", error);
  return json({error:"The service could not complete this request.", code:"internal_error"}, 500);
}
