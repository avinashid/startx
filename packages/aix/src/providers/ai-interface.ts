import { IEvent, type IEventWithPayload } from "@repo/lib/events";
import { encode } from "@toon-format/toon";
import { nanoid } from "nanoid";
import type z from "zod";

import { AiChat } from "./ai-chat.js";
import type { AiEventType } from "./ai-event.js";
import { AiPrompt } from "./ai-prompt.js";
import type { DefaultAiModels } from "./default-models.js";
import type { AiChatMessage, AiProvider } from "./types.js";
import { SchemaConvertor } from "../lib/convertor/schema-convertor.js";
import { Tokenizer } from "../lib/tokenizer/tokenizer.js";
import { ToolManager } from "../tools/tool-manager.js";
import type { GenericTool, TInternal } from "../tools/types.js";
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
	model: (typeof DefaultAiModels)[T][number]["id"];
	conversations: AiChatMessage[];
	credentials: {
		apiKey: string;
		baseUrl?: string;
	};
	tokens?: Partial<Record<"maxLimit" | "current" | "total", { input: number; output: number }>> & {
		minTokenToGenerateSchemaOnToolCall?: number;
	};
	internal?: TInternal;
}
export abstract class AiInterface<AI, P extends AiProvider> {
	constructor(props: AiInterfaceConstructor) {
		this.preferences = props.preferences;
		this.tools = new ToolManager({ whitelist: props.whitelistedTools ?? [], events: this.event });
		this.chats = new AiChat(props.conversations);
		this.model = props.model;
		this.credentials = props.credentials;
		this.iInternal = props.internal;
		const defaultToken = { input: 0, output: 0 };
		const defaultMaxToken = { input: 20000, output: 4000 };
		this.token = {
			total: props.tokens?.total ?? defaultToken,
			current: props.tokens?.current ?? defaultToken,
			maxLimit: props.tokens?.maxLimit ?? defaultMaxToken,
			minTokenToGenerateSchemaOnToolCall: props.tokens?.minTokenToGenerateSchemaOnToolCall ?? 1000,
		};
	}
	abstract ai: AI;
	protected abstract handleAi(): Promise<void>;
	abstract listModels(): Promise<{
		provider: string;
		name: string;
	}>;
	protected model: (typeof DefaultAiModels)[P][number]["id"];
	protected credentials: AiInterfaceConstructor["credentials"];
	private iInternal: TInternal;
	protected chats: AiChat;
	public token: Required<AiInterfaceConstructor["tokens"]>;
	public preferences: AiInterfaceConstructor["preferences"];
	public tools: ToolManager;

	protected callTool = async (props: {
		name: string;
		args: z.infer<GenericTool["schema"]>;
		toolCallId?: string;
		variablePlaceholders?: string[];
	}) => {
		// this.chats.addMessage({
		// 	role: "assistant",
		// 	content: `Calling tool ${props.name} with args ${JSON.stringify(props.args)}`,
		// 	timestamp: new Date(),
		// });

		const res = await this.tools.callTool({
			name: props.name,
			args: props.args,
			toolId: props.toolCallId ?? nanoid(),
			internal: this.iInternal,
		});

		const usedVariables: string[] = props.variablePlaceholders ?? [];
		this.chats.addResource(res.resources);
		for (const e of res.content) {
			switch (e.role) {
				case "assistant":
				case "system":
				case "user": {
					this.chats.addMessage(e);
					break;
				}
				case "tool": {
					const pString = e.content;
					let data: object | undefined = undefined;
					try {
						data = JSON.parse(e.content) as object;
					} catch {}
					if (!data || res.isError || (!this.iInternal?.system?.schemaOnly && res.isCompleted)) {
						this.chats.addMessage({
							role: "tool",
							content: AiPrompt.tool.call.success({
								toolName: props.name,
								isCompleted: res.isCompleted,
								isError: res.isError,
								args: JSON.stringify(props.args),
								data: pString,
							}),
							tool_call_id: e.tool_call_id,
							timestamp: new Date(),
						});
						continue;
					}

					const toon = encode(data);
					const token = Tokenizer.count(toon);

					if (token < (this.token?.minTokenToGenerateSchemaOnToolCall ?? 1000) && !this.iInternal?.system?.schemaOnly) {
						this.chats.addMessage({
							role: "tool",
							content: AiPrompt.tool.call.success({
								toolName: props.name,
								isCompleted: res.isCompleted,
								isError: res.isError,
								args: JSON.stringify(props.args),
								data: toon,
							}),
							tool_call_id: e.tool_call_id,
							timestamp: new Date(),
						});
						continue;
					}

					const schema = SchemaConvertor.jsonToSchema(e.content);

					if (!schema.schema) {
						this.chats.addMessage({
							role: "tool",
							content: AiPrompt.tool.call.success({
								toolName: props.name,
								isCompleted: res.isCompleted,
								isError: true,
								args: JSON.stringify(props.args),
								data: `Schema generation failed:`,
							}),
							tool_call_id: e.tool_call_id,
							timestamp: new Date(),
						});
						continue;
					}
					let value = usedVariables?.[0] ?? `v_${nanoid().replace(/[^a-zA-Z0-9_]/g, "_")}`;
					if (/^[0-9]/.test(value)) {
						value = "_" + value;
					}
					usedVariables.pop();
					this.iInternal?.vars?.set(value, {
						data: JSON.stringify(data),
						schema: schema.schema,
					});
					this.chats.addMessage({
						role: "tool",
						content: AiPrompt.tool.call.successSchema({
							args: JSON.stringify(props.args),
							toolName: props.name,
							varName: `vars.${value}`,
							schema: JSON.stringify(schema.schema),
						}),
						tool_call_id: e.tool_call_id,
						timestamp: new Date(),
					});
					if (
						!this.tools.whitelist.find(e => e === "execute_javascript") &&
						this.tools.registered.has("execute_javascript")
					) {
						this.event.emit("log", {
							type: "info",
							message: `Tool execute_javascript is not whitelisted. Adding...`,
						});

						this.tools.whitelist.push("execute_javascript");
						this.tools.tools.set("execute_javascript", this.tools.registered.get("execute_javascript")!);
					}
					break;
				}
			}
		}
		return {
			isCompleted: res.isCompleted,
			isError: res.isError,
		};
	};
	private async syncModels() {
		//  const models = await this.ai.
	}
	// Events
	protected event: IEvent<AiEventType> = new IEvent();
	public on<K extends keyof AiEventType>(event: K, handler: (payload: AiEventType[K]) => void) {
		this.event.on(event, handler);
		return () => this.event.off(event, handler);
	}
	public onEvery(handler: (e: IEventWithPayload<AiEventType>) => void) {
		return this.event.onEvery(handler);
	}
	public async handleUserMessage(message: string) {
		this.chats.addMessage({
			role: "user",
			content: message ?? "",
			timestamp: new Date(),
		});
		this.event.on("token", ({ input, output }) => {
			this.token!.total.input += input;
			this.token!.total.output += output;

			this.token!.current.input += input;
			this.token!.current.output += output;

			if (this.token!.total.input > this.token!.maxLimit.input) {
				throw new Error("Token input limit exceeded");
			}

			if (this.token!.total.output > this.token!.maxLimit.output) {
				throw new Error("Token output limit exceeded");
			}
		});
		await this.handleAi();
		return {
			token: this.token!.total,
			messages: this.chats.getMessages(),
			resources: this.chats.getResources(),
			vars: Array.from(this.iInternal?.vars.entries() || []),
		};
	}
}
