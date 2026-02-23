import { ping } from "@repo/constants";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import express from "express";
import fileUpload from "express-fileupload";


import { corsMiddleware } from "@/middlewares/cors-middleware.ts";
import { errorMiddleware } from "@/middlewares/error-middleware.ts";
import { loggerMiddleware } from "@/middlewares/logger-middleware.ts";
import { notFoundMiddleware } from "@/middlewares/notfound-middleware.ts";
import { serveStatic } from "@/middlewares/serve-static.ts";

import { createFilesRouter } from "./files/router.js";

const app = express() as express.Express;
app.use(loggerMiddleware);
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(fileUpload());
app.use(corsMiddleware);

app.use("/files", createFilesRouter());

app.get("/test", (req: Request, res: Response) => {
	res.statusCode = 200;
	res.json("OK");
	return;
});
console.warn(ping);
app.use(serveStatic());
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
