import { Router, static as expressStatic } from "express";

export function createFilesRouter(): Router {
	const router = Router();
	router.get("/*", expressStatic("storage"));
	return router;
}
