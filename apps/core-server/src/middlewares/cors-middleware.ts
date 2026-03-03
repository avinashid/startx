import { ENV } from "@repo/lib/env-module";
import cors from "cors";
export const corsMiddleware = cors({
	origin: [ENV.CLIENT_URL, ENV.CORS_URL],
	credentials: true,
});
