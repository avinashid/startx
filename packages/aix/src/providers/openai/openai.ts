import OpenAI from "openai";
import type { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions.mjs";
import { AiInterface, type AiInterfaceConstructor } from "../ai-interface.js";
export class OpenAIClient extends AiInterface<OpenAI, "openAi"> {
	constructor(props: AiInterfaceConstructor) {
		super(props);
		this.ai = new OpenAI({ apiKey: props.credentials.apiKey, baseURL: props.credentials.baseUrl });
	}
	ai: OpenAI;
	async listModels(): Promise<any> {
		return await this.ai.models.list();
	}
	async handleAi() {
		const getCompletion = async (retries = 1): Promise<OpenAI.Chat.ChatCompletion> => {
			try {
				const tools = this.tools.getActiveTools().map(tool => ({
					type: "function" as const,
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.input_schema.toJSONSchema(),
					} as const,
				}));

				const hasAnyTools =
					tools.length > 0
						? ({
								tools,
								tool_choice: this.preferences.toolOnly ? "required" : "auto",
							} as const)
						: {};

				const messages = this.chats.getMessages();
				const response = await this.ai.chat.completions.create({
					model: this.model,
					messages: messages.map(e => ({
						role: e.role,
						content: e.content,
					})) as unknown as ChatCompletionCreateParamsBase["messages"],
					temperature: this.preferences.temperature,
					max_completion_tokens: this.preferences.maxCompletionTokens,
					...hasAnyTools,
				});
				if (response.usage) {
					this.event.emit("token", {
						input: response.usage.prompt_tokens,
						output: response.usage.completion_tokens,
					});
				}
				return response;
			} catch (error) {
				const err = error as Error;
				this.event.emit("log", {
					type: "error",
					message: err.message,
					meta: err.cause as Record<string, unknown>,
					stack: err.stack,
				});
				throw error;
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
				return;
			}

			const message = choice.message;
			this.chats.addMessage({
				role: "assistant",
				content: message.content || "",
				tool_calls: message.tool_calls,
				timestamp: new Date(),
			});
			if (message.content) {
				return;
			}

			if (!message.tool_calls?.length) {
				return;
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
									// stack: (err as any).stack,
								});
								continue;
							}
							const result = await this.callTool({
								args: toolArgs as Record<string, unknown>,
								name: toolCall.function.name,
								toolCallId: toolCall.id,
							});

							if (result.isCompleted) {
								return;
							}
							if (result.isError) {
								return;
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
			return;
		}
	}
}
