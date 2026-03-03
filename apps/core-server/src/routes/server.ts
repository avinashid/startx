import cookieParser from "cookie-parser";
import express, { json, urlencoded } from "express";
import fileUpload from "express-fileupload";

import { corsMiddleware } from "@/middlewares/cors-middleware.js";
import { errorMiddleware } from "@/middlewares/error-middleware.js";
import { loggerMiddleware } from "@/middlewares/logger-middleware.js";
import { notFoundMiddleware } from "@/middlewares/notfound-middleware.js";
import { serveStatic } from "@/middlewares/serve-static.js";

import { createFilesRouter } from "./files/router.js";

const app = express();
app.use(loggerMiddleware);
app.use(cookieParser());
app.use(urlencoded({ extended: true }));
app.use(json());
app.use(fileUpload());
app.use(corsMiddleware);
app.use("/files", createFilesRouter());

app.get("/test", (_req, res) => {
	res.statusCode = 200;
	res.json("OK");
	return;
});

app.use(serveStatic());
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
