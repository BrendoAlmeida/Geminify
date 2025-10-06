export async function exponentialBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 5,
  initialDelay = 1000
): Promise<T> {
  let retries = 0;

  while (true) {
    try {
      return await fn();
    } catch (error: any) {
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
