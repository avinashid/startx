import cors from "cors";
// you can ditch this write your own middlewares from scratch
export const corsMiddleware = cors({
  origin: [process.env.CLIENT_URL, process.env.CORS_URL!],
  credentials: true,
});
