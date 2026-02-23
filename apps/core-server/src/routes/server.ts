import { ping } from "@repo/constants";
import cookieParser from "cookie-parser";
import type { Request, Response } from "express";
import express from "express";
import fileUpload from "express-fileupload";
import { corsMiddleware } from "middlewares/cors-middleware.js";
import { errorMiddleware } from "middlewares/error-middleware.js";
import { loggerMiddleware } from "middlewares/logger-middleware.js";
import { notFoundMiddleware } from "middlewares/notfound-middleware.js";
import { serveStatic } from "middlewares/serve-static.js";

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
console.log(ping);
app.use(serveStatic());
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
