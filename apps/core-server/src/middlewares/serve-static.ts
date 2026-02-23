import express, { Router, type Request, type Response, type NextFunction } from "express";
import path from "path";

const distPath =
	process.env.NODE_ENV === "production" ? "../frontend" : "../../../web-client/dist/client";

// __dirname is available at runtime because we compile to CommonJS
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
