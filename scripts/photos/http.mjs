import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
const userAgent =
  process.env.PHOTO_USER_AGENT ||
  "TimeTravelerPhotoLibrary/1.0 (https://time-traveler-archive.khushaldangar.chatgpt.site; historical photography importer)";
const clocks = new Map();
export class ProviderError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}
export function retryDelay(value, now = Date.now()) {
  if (!value) return 2000;
  const seconds = Number(value);
  return Math.max(
    1000,
    Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now || 2000,
  );
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function request(
  url,
  { binary = false, cache = true, delay = 1100 } = {},
) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:")
    throw new ProviderError("HTTPS is required");
  const key = createHash("sha256").update(url).digest("hex");
  const file = join(".photo-library/cache", key + (binary ? ".bin" : ".json"));
  if (cache)
    try {
      const bytes = await readFile(file);
      return binary ? bytes : JSON.parse(bytes);
    } catch {
      /* cache miss */
    }
  await mkdir(".photo-library/cache", { recursive: true });
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(Math.max(0, (clocks.get(parsed.hostname) ?? 0) - Date.now()));
    clocks.set(
      parsed.hostname,
      Date.now() +
        (parsed.hostname.endsWith("loc.gov") ? Math.max(3100, delay) : delay),
    );
    let response;
    try {
      response = await fetch(url, {
        headers: {
          "User-Agent": userAgent,
          Accept: binary ? "image/*" : "application/json",
        },
        signal: AbortSignal.timeout(45000),
        redirect: "follow",
      });
    } catch (error) {
      if (attempt === 3)
        throw new ProviderError(`Network failure: ${error.message}`);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (response.status === 429 || response.status === 503) {
      const wait = retryDelay(response.headers.get("retry-after"));
      if (attempt === 3 || wait > 120000)
        throw new ProviderError(
          `Provider asks us to stop or retry later (${response.status}, Retry-After=${response.headers.get("retry-after")})`,
          response.status,
        );
      clocks.set(parsed.hostname, Date.now() + wait);
      continue;
    }
    if (!response.ok)
      throw new ProviderError(
        `HTTP ${response.status} from ${parsed.hostname}`,
        response.status,
      );
    const contentType = response.headers.get("content-type") ?? "";
    if (!binary && !contentType.includes("json"))
      throw new ProviderError(
        `Expected API JSON; received ${contentType}. Access challenges are not bypassed.`,
        response.status,
      );
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > 25000000)
      throw new ProviderError("Asset exceeds 25MB download ceiling");
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 25000000) {
        await reader.cancel();
        throw new ProviderError("Asset exceeds download ceiling");
      }
      chunks.push(Buffer.from(value));
    }
    const bytes = Buffer.concat(chunks);
    if (binary && !contentType.startsWith("image/"))
      throw new ProviderError(`Expected image; received ${contentType}`);
    const result = binary ? bytes : JSON.parse(bytes.toString());
    if (!binary && result.error) {
      if (result.error.code === "maxlag" && attempt < 3) {
        clocks.set(
          parsed.hostname,
          Date.now() + retryDelay(response.headers.get("retry-after")),
        );
        continue;
      }
      throw new ProviderError(
        `API error: ${result.error.code ?? "unknown"} ${result.error.info ?? ""}`,
      );
    }
    if (cache) await writeFile(file, binary ? bytes : JSON.stringify(result));
    return result;
  }
  throw new ProviderError("Retry budget exhausted");
}
