import type { IEvent } from "@repo/lib/events";
import type z from "zod";
import type { GenericTool, TInternal, ToolConnector } from "./types.js";
import type { AiEventType } from "@/providers/ai-event.js";
import type { AiChatMessage, AiResource } from "@/providers/types.js";

export class ToolManager {
	public whitelist: string[] = [];
	private events: IEvent<AiEventType>;
	public tools: Map<string, GenericTool> = new Map();

	constructor(props: { whitelist: string[]; events: IEvent<AiEventType> }) {
		this.whitelist = props.whitelist ?? [];
		this.events = props.events;
	}

	public attachTools(props: ToolConnector) {
		switch (props.type) {
			case "internal": {
				for (const t of props.tool) {
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
				throw new Error("MCP tool call not implemented yet!");
			}
			default: {
				throw new Error(`Unknown tool type: ${JSON.stringify(props)}`);
			}
		}
	}
	public getTools() {
		return Array.from(this.tools.values()).map(e => ({
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
	public async callTool(props: { name: string; args: z.infer<GenericTool["schema"]>; internal?: TInternal }) {
		try {
			const tool = this.tools.get(props.name);
			if (!tool) {
				throw new Error(`Tool ${props.name} not found`);
			}

			this.events.emit("tool.start", {
				name: tool.name,
				args: props.args,
			});
			const result = await tool.run(props.args, props.internal);
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
					});
					continue;
				}
				switch (item.uri) {
					case "return": {
						const returnMeta = item._meta;
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
		} catch (error: any) {
			this.events.emit("log", {
				type: "error",
				message: `Error running tool ${props.name}: ${error?.message}`,
				stack: error?.stack,
				meta: error?.meta,
			});

			return {
				isCompleted: false,
				isError: true,
				resources: [],
				content: [
					{
						role: "tool",
						content: `Error running tool ${props.name}: ${error?.message}`,
					},
				] as AiChatMessage[],
			};
		}
	}
}
