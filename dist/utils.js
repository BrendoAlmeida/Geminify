export async function exponentialBackoff(fn, maxRetries = 5, initialDelay = 1000) {
    let retries = 0;
    while (true) {
        try {
            return await fn();
        }
        catch (error) {
            if (error.statusCode === 429 && retries < maxRetries) {
                const delay = error.headers["retry-after"]
                    ? parseInt(error.headers["retry-after"]) * 1000
                    : initialDelay * Math.pow(2, retries);
                console.log(`Rate limited. Retrying after ${delay}ms`);
                await new Promise((resolve) => setTimeout(resolve, delay));
                retries++;
            }
            else {
                throw error;
            }
        }
    }
}
function stringifyErrorBody(body) {
    if (!body) {
        return "undefined";
    }
    if (typeof body === "string") {
        return body;
    }
    try {
        return JSON.stringify(body, null, 2);
    }
    catch (_error) {
        return String(body);
    }
}
export function formatSpotifyError(error) {
    return `Spotify API Error:
      Status: ${error.statusCode}
      Message: ${error.message}
      Details: ${error.body?.error?.message || "Unknown"}
      Reason: ${error.body?.error?.reason || "Unknown"}
      Raw Body: ${stringifyErrorBody(error.body)}
      ${error.headers ? `Headers: ${stringifyErrorBody(error.headers)}` : ""}
      ${error.stack ? `Stack: ${error.stack}` : ""}`;
}
