import { exponentialBackoff } from "../utils/backoff.js";

export class RequestQueue {
  private queue: Array<() => Promise<void>> = [];

  private isProcessing = false;

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await exponentialBackoff(fn);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (request) {
        await request();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    this.isProcessing = false;
  }
}
