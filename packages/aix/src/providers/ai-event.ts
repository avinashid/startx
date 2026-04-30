import type { ToolReturn } from "../tools/types.js";

export type AiEventType = {
	"ai.think.partial": string;
	"ai.finish": string;
	"tool.start": {
		name: string;
		args: any;
	};
	"tool.finish": ToolReturn;
	"log": {
		type: "info" | "warn" | "error";
		message: string;
		stack?: string;
		meta?: Record<string, unknown>;
	};
	"token": {
		input: number;
		output: number;
	};
};
