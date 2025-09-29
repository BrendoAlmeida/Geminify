import { exponentialBackoff } from "./utils";
export class RequestQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
    }
    async add(fn) {
        return new Promise((resolve, reject) => {
            this.queue.push(async () => {
                try {
                    const result = await exponentialBackoff(fn);
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            });
            this.process();
        });
    }
    async process() {
        if (this.isProcessing)
            return;
        this.isProcessing = true;
        while (this.queue.length > 0) {
            const request = this.queue.shift();
            if (request) {
                await request();
                await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms delay between requests
            }
        }
        this.isProcessing = false;
    }
}
