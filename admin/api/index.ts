import { configuredApp } from "../server/runtime.js";

// Vercel owns the listener; only the admin API runs here. The CDN serves dist/.
const { app } = configuredApp(false);
export default app;
