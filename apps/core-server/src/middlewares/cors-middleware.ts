import cors from "cors";
export const corsMiddleware = cors({
	origin: [process.env.CLIENT_URL, process.env.CORS_URL!],
	credentials: true,
});
