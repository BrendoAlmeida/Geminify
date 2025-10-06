export async function exponentialBackoff(fn, maxRetries = 5, initialDelay = 1000) {
    let retries = 0;
    while (true) {
        try {
            return await fn();
        }
        catch (error) {
            if (error?.statusCode === 429 && retries < maxRetries) {
                const delay = error.headers?.["retry-after"]
                    ? parseInt(error.headers["retry-after"], 10) * 1000
                    : initialDelay * Math.pow(2, retries);
                await new Promise((resolve) => setTimeout(resolve, delay));
                retries += 1;
                continue;
            }
            throw error;
        }
    }
}
