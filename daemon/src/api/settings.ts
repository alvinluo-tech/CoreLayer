import { Hono } from "hono";
import storageRoutes from "./settings-storage.js";
import providerRoutes from "./settings-providers.js";
import modelRoutes from "./settings-model.js";
import usageRoutes from "./settings-usage.js";

const app = new Hono();

// Mount sub-routers
app.route("/", storageRoutes);
app.route("/", providerRoutes);
app.route("/", modelRoutes);
app.route("/", usageRoutes);

export default app;
