import OpenAI from "openai";
import { AiInterface, type AiInterfaceConstructor } from "../ai-interface.js";
import type { AiChatMessage, AiResource } from "../types.js";

export class OpenAIClient extends AiInterface<OpenAI, "openAi"> {
	constructor(props: AiInterfaceConstructor) {
		super(props);
		this.ai = new OpenAI({ apiKey: props.credentials.apiKey, baseURL: props.credentials.baseUrl });
	}
	ai: OpenAI;
	async handleMessage(message?: string): Promise<{
		messages: AiChatMessage[];
		resources: AiResource[];
	}> {
		if (message) {
			this.chats.addMessage({ role: "user", content: message, timestamp: new Date() });
		}

		const tools = this.tools.getTools().map(tool => ({
			type: "function" as const,
			function: {
				name: tool.name,
				description: tool.description,
				parameters: tool.input_schema.toJSONSchema(),
			} as const,
		}));

		const getCompletion = async (retries = 3): Promise<OpenAI.Chat.ChatCompletion> => {
			try {
				const response = await this.ai.chat.completions.create({
					model: this.model,
					messages: this.chats.getMessages(),
					tools,
					tool_choice: !this.preferences.toolOnly ? "auto" : "required",
					temperature: this.preferences.temperature,
				});
				return response;
			} catch (error) {
				this.event.emit("log", {
					type: "error",
					message: (error as any).message,
					meta: { error },
					stack: (error as any).stack,
				});
				if (retries <= 0) throw error;

				await new Promise(r => setTimeout(r, 500));
				return await getCompletion(retries - 1);
			}
		};

		let response = await getCompletion();

		while (true) {
			const choice = response?.choices?.[0];
			if (!choice) {
				this.event.emit("log", {
					type: "warn",
					message: `⚠️ No choices returned in response: ${JSON.stringify(response, null, 2)}`,
				});
				console.warn();
				return {
					messages: this.chats.getMessages(),
					resources: [],
				};
			}

			const message = choice.message;

			if (message.content) {
				this.chats.addMessage({
					role: "assistant",
					content: message.content,
					timestamp: new Date(),
				});
				return {
					messages: this.chats.getMessages(),
					resources: [],
				};
			}

			if (message.tool_calls?.length) {
				for (const toolCall of message.tool_calls) {
					switch (toolCall.type) {
						case "function": {
							let toolArgs: object;
							try {
								toolArgs = JSON.parse(toolCall.function.arguments) as object;
							} catch (err) {
								this.event.emit("log", {
									type: "error",
									message: `Tool: ${toolCall.function.name}⚠️ Failed to parse tool arguments: ${toolCall.function.arguments}`,
									meta: { err },
									stack: (err as any).stack,
								});
								continue;
							}
							const result = await this.callTool({
								args: toolArgs as Record<string, unknown>,
								name: toolCall.function.name,
							});

							if (result.isCompleted) {
								return {
									messages: this.chats.getMessages(),
									resources: this.chats.getResources(),
								};
							}
							break;
						}
						case "custom": {
							this.event.emit("log", {
								type: "error",
								message: `Tool: ${toolCall.type}⚠️ Unsupported tool type: ${toolCall.type}`,
							});
							continue;
						}
					}
				}
				response = await getCompletion();
				continue;
			}
			this.event.emit("log", {
				type: "warn",
				message: `⚠️ No content returned in response: ${JSON.stringify(response, null, 2)}`,
			});
			return {
				messages: this.chats.getMessages(),
				resources: [],
			};
		}
	}
}
