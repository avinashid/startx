import { IEvent, type IEventWithPayload } from "@repo/lib/events";
import { nanoid } from "nanoid";
import type z from "zod";

import { SchemaConvertor } from "@/lib/convertor/schema-convertor.js";
import { Tokenizer } from "@/lib/tokenizer/tokenizer.js";
import { ToolManager } from "@/tools/tool-manager.js";
import type { GenericTool, TInternal } from "@/tools/types.js";
import { AiChat } from "./ai-chat.js";
import type { AiEventType } from "./ai-event.js";
import type { DefaultAiModels } from "./default-models.js";
import type { AiChatMessage, AiProvider } from "./types.js";
export interface AiInterfaceConstructor<T extends AiProvider = AiProvider> {
	preferences: {
		name: string;
		version?: string;
		type: "manager" | "worker";
		toolOnly: boolean;
		temperature?: number;
		seed?: number;
	};
	whitelistedTools?: string[];
	model: (typeof DefaultAiModels)[T][number];
	defaultChats: AiChatMessage[];
	credentials: {
		apiKey: string;
		baseUrl: string;
	};
}
export abstract class AiInterface<AI, P extends AiProvider> {
	constructor(props: AiInterfaceConstructor) {
		this.preferences = props.preferences;
		this.tools = new ToolManager({ whitelist: props.whitelistedTools ?? [], events: this.event });
		this.chats = new AiChat(props.defaultChats);
		this.model = props.model;
		this.credentials = props.credentials;
	}
	abstract ai: AI;
	protected model: (typeof DefaultAiModels)[P][number];
	protected credentials: AiInterfaceConstructor["credentials"];
	private iInternal: TInternal = {};
	protected chats: AiChat;
	public preferences: AiInterfaceConstructor["preferences"];
	public tools: ToolManager;

	protected callTool = async (props: { name: string; args: z.infer<GenericTool["schema"]> }) => {
		this.chats.addMessage({
			role: "assistant",
			content: `Calling tool ${props.name} with args ${JSON.stringify(props.args)}`,
			timestamp: new Date(),
		});
		const res = await this.tools.callTool({
			name: props.name,
			args: props.args,
			internal: this.iInternal,
		});
		this.chats.addResource(res.resources);
		for (const e of res.content) {
			if (e.role === "tool") {
				let parsedString;
				try {
					parsedString = JSON.parse(e.content) as object;
				} catch {
					parsedString = e.content;
				}

				const token = Tokenizer.count(e.content);

				if (token < 4096) {
					this.chats.addMessage({
						role: "tool",
						content: e.content,
						tool_call_id: e.tool_call_id,
						timestamp: new Date(),
					});
					continue;
				}
				const schema = SchemaConvertor.jsonToSchema(e.content);
				const value = nanoid();
				this.iInternal?.vars?.set(value, {
					data: JSON.stringify(parsedString),
					schemaType: schema.type,
					schema: schema.schema,
				});
				this.chats.addMessage({
					role: "tool",
					content: `Variable ${value} (${schema.type}) with schema ${JSON.stringify(schema.schema)}`,
					tool_call_id: e.tool_call_id,
					timestamp: new Date(),
				});
				continue;
			}
		}
		return {
			isCompleted: res.isCompleted,
			isError: res.isError,
		};
	};

	// Events
	protected event: IEvent<AiEventType> = new IEvent();
	public on<K extends keyof AiEventType>(event: K, handler: (payload: AiEventType[K]) => void) {
		this.event.on(event, handler);
		return () => this.event.off(event, handler);
	}
	public onEvery(handler: (e: IEventWithPayload<AiEventType>) => void) {
		return this.event.onEvery(handler);
	}
}
