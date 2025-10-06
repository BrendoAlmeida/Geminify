import { appConfig } from "../config/env";
export function log(message) {
    if (appConfig.isDevelopment) {
        // eslint-disable-next-line no-console
        console.log(`[${new Date().toISOString()}] ${message}`);
    }
}
