import express, { type NextFunction, type Request, type Response, Router } from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === "production";

const distPath = isProd ? "../frontend" : "../../../web-client/dist/client";

const reactDistPath = path.resolve(__dirname, distPath);

export const serveStatic = (): Router => {
	const router = Router();

	router.use(express.static(reactDistPath));

	router.get("*", (req: Request, res: Response, next: NextFunction) => {
		const accept = req.headers.accept ?? "";

		if (accept.includes("text/html")) {
			return res.sendFile(path.join(reactDistPath, "index.html"));
		}

		return next();
	});

	return router;
};
