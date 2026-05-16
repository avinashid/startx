import { BedrockClient as AwsBedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock";
import {
	BedrockRuntimeClient,
	ConverseCommand,
	type Tool,
	type Message,
	type SystemContentBlock,
	type ToolUseBlock,
} from "@aws-sdk/client-bedrock-runtime";

import { AiInterface, type AiInterfaceConstructor } from "../ai-interface.js";

type BedrockCredentials = {
	accessKeyId: string;
	secretAccessKey: string;
	sessionToken?: string;
	region: string;
};

export class BedrockClient extends AiInterface<BedrockRuntimeClient, "bedrock"> {
	ai: BedrockRuntimeClient;
	private controlPlane: AwsBedrockClient;

	constructor(
		props: AiInterfaceConstructor & {
			credentials: BedrockCredentials;
		}
	) {
		super(props);

		const awsConfig = {
			region: props.credentials.region,
			credentials: {
				accessKeyId: props.credentials.accessKeyId,
				secretAccessKey: props.credentials.secretAccessKey,
				sessionToken: props.credentials.sessionToken,
			},
		};

		this.ai = new BedrockRuntimeClient(awsConfig);

		this.controlPlane = new AwsBedrockClient(awsConfig);
	}

	async listModels() {
		const models = await this.controlPlane.send(new ListFoundationModelsCommand({}));
		return (
			models.modelSummaries?.map(e => ({
				provider: e.providerName!,
				name: e.modelName!,
			})) ?? []
		);
	}

	private mapMessages(): { messages: Message[]; system: SystemContentBlock[] } {
		const messages: Message[] = [];
		const system: SystemContentBlock[] = [];

		for (const msg of this.chats.getMessages()) {
			if (msg.role === "system") {
				system.push({ text: msg.content });
				continue;
			}

			if (msg.role === "tool") {
				messages.push({
					role: "user",
					content: [
						{
							toolResult: {
								toolUseId: msg.tool_call_id,
								content: [{ text: msg.content }],
							},
						},
					],
				});
				continue;
			}

			const contentBlocks: Message["content"] = [];

			if (msg.content) {
				contentBlocks.push({ text: msg.content });
			}

			if (msg.role === "assistant" && "tool_calls" in msg) {
				msg.tool_calls.forEach(tc => {
					if (tc.type === "function") {
						const func = tc as unknown as {
							function: {
								name: string;
								arguments: string;
							};
						};
						contentBlocks.push({
							toolUse: {
								toolUseId: tc.id,
								name: func.function.name,
								input: JSON.parse(func.function.arguments) as ToolUseBlock["input"],
							},
						});
					}
				});
			}

			messages.push({
				role: msg.role === "assistant" ? "assistant" : "user",
				content: contentBlocks,
			});
		}

		return { messages, system };
	}

	private mapTools(): Tool[] {
		return this.tools.getActiveTools().map(tool => ({
			toolSpec: {
				name: tool.name,
				description: tool.description,
				inputSchema: {
					json: tool.input_schema.toJSONSchema(),
				},
			},
		})) as Tool[];
	}

	async handleAi() {
		const getCompletion = async () => {
			try {
				const tools = this.mapTools();
				const { messages, system } = this.mapMessages();

				const response = await this.ai.send(
					new ConverseCommand({
						modelId: this.model,
						messages,
						system: system.length ? system : undefined,
						inferenceConfig: {
							temperature: this.preferences.temperature,
							maxTokens: this.preferences.maxCompletionTokens,
						},
						...(tools.length
							? {
									toolConfig: {
										tools,
										toolChoice: this.preferences.toolOnly ? { any: {} } : { auto: {} },
									},
								}
							: {}),
					})
				);

				if (response.usage) {
					this.event.emit("token", {
						input: response.usage.inputTokens ?? 0,
						output: response.usage.outputTokens ?? 0,
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
			const output = response.output?.message;

			if (!output) {
				this.event.emit("log", {
					type: "warn",
					message: `⚠️ No output returned: ${JSON.stringify(response, null, 2)}`,
				});
				return;
			}

			let assistantText = "";
			const toolCalls: Array<{
				id: string;
				type: "function";
				function: {
					name: string;
					arguments: string;
				};
			}> = [];

			for (const part of output.content ?? []) {
				if ("text" in part && part.text) {
					assistantText += part.text;
				}

				if ("toolUse" in part && part.toolUse) {
					toolCalls.push({
						id: part.toolUse.toolUseId!,
						type: "function",
						function: {
							name: part.toolUse.name!,
							arguments: JSON.stringify(part.toolUse.input ?? {}),
						},
					});
				}
			}

			this.chats.addMessage({
				role: "assistant",
				content: assistantText,
				tool_calls: toolCalls.length ? toolCalls : undefined,
				timestamp: new Date(),
			});

			if (assistantText && toolCalls.length === 0) {
				return;
			}

			if (!toolCalls.length) {
				return;
			}

			for (const toolCall of toolCalls) {
				let toolArgs: object = {};

				try {
					toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
				} catch (err) {
					this.event.emit("log", {
						type: "error",
						message: `Tool: ${toolCall.function.name}⚠️ Failed to parse tool arguments: ${toolCall.function.arguments}`,
						meta: { err },
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
			}

			response = await getCompletion();
		}
	}
}
