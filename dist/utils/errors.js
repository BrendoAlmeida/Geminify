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
      Status: ${error?.statusCode}
      Message: ${error?.message}
      Details: ${error?.body?.error?.message || "Unknown"}
      Reason: ${error?.body?.error?.reason || "Unknown"}
      Raw Body: ${stringifyErrorBody(error?.body)}
      ${error?.headers ? `Headers: ${stringifyErrorBody(error.headers)}` : ""}
      ${error?.stack ? `Stack: ${error.stack}` : ""}`;
}
