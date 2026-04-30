import { IEvent } from "@repo/lib/events";
import { jsonrepair } from "jsonrepair";
import type z from "zod";
import type { GenericTool, TInternal, ToolConnector } from "./types.js";
import type { AiEventType } from "../providers/ai-event.js";
import type { AiChatMessage, AiResource } from "../providers/types.js";

export class ToolManager {
	public whitelist: string[] = [];
	private events: IEvent<AiEventType>;
	public registered: Map<string, GenericTool> = new Map();
	public tools: Map<string, GenericTool> = new Map();

	constructor(props?: { whitelist?: string[]; events?: IEvent<AiEventType> }) {
		this.whitelist = props?.whitelist ?? [];
		this.events = props?.events || new IEvent();
	}

	public async attachTools(props: ToolConnector) {
		switch (props.type) {
			case "internal": {
				for (const t of props.tool) {
					this.registered.set(t.title, {
						name: t.title
							.replace(/^[^a-zA-Z_]+/, "")
							.replace(/[^a-zA-Z0-9_.-]/g, "_")
							.slice(0, 64),
						description: t.description,
						schema: t.schema,
						run: t.run,
					});
					if (!this.whitelist.includes(t.title)) {
						this.events.emit("log", {
							type: "warn",
							message: `Tool ${t.title} is not whitelisted. Skipping...`,
						});
						continue;
					}
					if (this.tools.has(t.title)) {
						this.events.emit("log", {
							type: "warn",
							message: `Tool ${t.title} is already registered. Skipping...`,
						});
						continue;
					}
					this.events.emit("log", {
						type: "info",
						message: `Registering tool ${t.title}`,
					});
					this.tools.set(t.title, {
						name: t.title
							.replace(/^[^a-zA-Z_]+/, "")
							.replace(/[^a-zA-Z0-9_.-]/g, "_")
							.slice(0, 64),
						description: t.description,
						schema: t.schema,
						run: t.run,
					});
				}
				break;
			}

			case "mcp": {
				// TODO: implement mcp tool call
				// Remove this
				await new Promise(resolve => setTimeout(resolve, 0));
				throw new Error("MCP tool call not implemented yet!");
			}
			default: {
				throw new Error(`Unknown tool type: ${JSON.stringify(props)}`);
			}
		}
	}
	public getActiveTools() {
		return Array.from(this.tools.values()).map(e => ({
			name: e.name,
			description: e.description,
			input_schema: e.schema,
		}));
	}
	public getRegisteredTools() {
		return Array.from(this.registered.values()).map(e => ({
			name: e.name,
			description: e.description,
			input_schema: e.schema,
		}));
	}
	public removeTool(title: string) {
		if (this.tools.has(title)) {
			this.events.emit("log", {
				type: "info",
				message: `Unregistering tool ${title}`,
			});
			this.tools.delete(title);
		}
	}
	public async callTool(props: {
		name: string;
		args: z.infer<GenericTool["schema"]>;
		toolId: string;
		internal?: TInternal;
	}) {
		try {
			const tool = this.tools.get(props.name);
			if (!tool) {
				throw new Error(`Tool ${props.name} not found`);
			}

			this.events.emit("tool.start", {
				name: tool.name,
				args: props.args,
			});
			const result = await tool.run(
				ToolManager.parseArgs(props.args) as z.infer<GenericTool["schema"]>,
				props.internal
			);
			this.events.emit("tool.finish", result);

			if (!result.length) {
				throw new Error("Tool result not returned anything. Please try again.");
			}
			const content: AiChatMessage[] = [];
			let isCompleted = false;
			let isError = false;

			const resources: AiResource[] = [];
			for (const item of result) {
				if (item.type === "text") {
					content.push({
						role: "tool",
						content: item.text,
						timestamp: new Date(),
						tool_call_id: props.toolId,
					});
					continue;
				}
				if (item._meta.return) {
					isCompleted = !!item._meta.return.isCompleted;
					isError = !!item._meta.return.isError;
				}
				switch (item.uri) {
					case "return": {
						const returnMeta = item._meta.return;
						if (returnMeta?.isCompleted) isCompleted = true;
						if (returnMeta?.isError) isError = true;
						break;
					}
					case "table": {
						resources.push({
							type: "table",
							data: item._meta.data,
							columns: item._meta.columns,
						});
						break;
					}
					case "image": {
						resources.push({
							type: "image",
							source: item._meta.source,
							alt: item._meta.alt,
						});
						break;
					}
					case "file": {
						resources.push({
							type: "file",
							source: item._meta.source,
						});
						break;
					}
					case "user_message": {
						content.push({
							role: "user",
							content: item._meta.message,
							timestamp: new Date(),
						});
						break;
					}
				}
			}
			return {
				isCompleted,
				isError,
				content,
				resources,
			};
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			const message = `Tool ${props.name} failed: ${err.message}`;
			this.events.emit("log", {
				type: "error",
				message,
				stack: err.stack,
				meta: err.cause as Record<string, unknown>,
			});
			return {
				isCompleted: false,
				isError: true,
				resources: [],
				content: [
					{
						role: "tool",
						content: message,
					},
				] as AiChatMessage[],
			};
		}
	}
	protected static parseArgs = (obj: any): any => {
		if (typeof obj !== "object" || obj === null) return obj;

		// Create a new object/array to avoid mutating the original payload
		const parsedObj = Array.isArray(obj) ? [...obj] : { ...obj };

		for (const key in parsedObj) {
			const value = parsedObj[key];

			if (typeof value === "string" && (value.trim().startsWith("[") || value.trim().startsWith("{"))) {
				try {
					// 1. Try a standard parse first
					parsedObj[key] = JSON.parse(value);
				} catch {
					try {
						// 2. If it fails (due to unescaped quotes, etc.), repair it and try again
						parsedObj[key] = JSON.parse(jsonrepair(value));
					} catch {
						// 3. If it still fails, it's not JSON. Leave it as a string.
					}
				}

				// Recursively parse the newly parsed object (in case of deep nesting)
				if (typeof parsedObj[key] === "object") {
					parsedObj[key] = this.parseArgs(parsedObj[key]);
				}
			} else if (typeof value === "object") {
				parsedObj[key] = this.parseArgs(value);
			}
		}
		return parsedObj;
	};
}
