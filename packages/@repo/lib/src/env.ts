import * as dotenv from "dotenv";
import path from "path";

import { __dirname } from "./utils.js";

if (process.env.NODE_ENV === "test") {
	console.log("loading test env", process.cwd(), __dirname());
	dotenv.config({ path: path.join(__dirname(), ".env.test") });
} else {
	dotenv.config();
	dotenv.config({ path: path.join(__dirname(), ".env") });
}
export  {dotenv};
