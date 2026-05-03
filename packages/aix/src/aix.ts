import { IEvent, type IEventWithPayload } from "@repo/lib/events";
import { logger } from "@repo/logger";
import type z from "zod";
import type { AiInterfaceConstructor } from "./providers/ai-interface.js";
import type { DefaultAiModels } from "./providers/default-models.js";
import { aiProvider } from "./providers/providers.js";
import type { AiProvider } from "./providers/types.js";
import { ITool } from "./tools/i-tool.js";
import { PlannerTool, SummarizerTool } from "./tools/index.js";
import { ToolManager } from "./tools/tool-manager.js";
import type { TInternal, ToolConnector } from "./tools/types.js";

export class Aix {
	static client = <T extends AiProvider>(type: T) => aiProvider<T>(type);

	static summarizer = async <T extends AiProvider>(props: {
		provider: T;
		model: (typeof DefaultAiModels)[T][number]["id"];
		credentials: AiInterfaceConstructor["credentials"];
		message: string;
	}) => {
		const ai = this.client(props.provider)({
			model: props.model,
			credentials: props.credentials,
			conversations: [],
			preferences: {
				name: "summarizer",
				type: "worker",
				toolOnly: true,
			},
			whitelistedTools: ["general-summarizer"],
		});

		await ai.tools.attachTools({
			type: "internal",
			tool: SummarizerTool,
			isInternal: true,
		});

		const response = await ai.handleUserMessage(props.message);
		const messages = response.messages;
		const summary = JSON.parse(messages[messages.length - 1].content) as {
			summary: string;
		};

		return {
			summary: summary?.summary,
			token: response.token,
		};
	};

	static querySummarizer = async <T extends AiProvider>(props: {
		provider: T;
		model: (typeof DefaultAiModels)[T][number]["id"];
		credentials: AiInterfaceConstructor["credentials"];
		message: string;
	}) => {
		const ai = this.client(props.provider)({
			model: props.model,
			credentials: props.credentials,
			conversations: [],
			preferences: {
				name: "summarizer",
				type: "worker",
				toolOnly: true,
			},
			whitelistedTools: ["query-summarizer"],
		});

		await ai.tools.attachTools({
			type: "internal",
			tool: SummarizerTool,
			isInternal: true,
		});

		const response = await ai.handleUserMessage(props.message);
		const messages = response.messages;
		const summary = JSON.parse(messages[messages.length - 1].content) as
			| {
					isFeasible: true;
					intentSummary: string;
					executionPlan: string;
					requiredTools: string[];
			  }
			| {
					isFeasible: false;
					abortReason: string;
					intentSummary: string;
			  };

		return {
			summary,
			token: response.token,
		};
	};

	static planner = async <T extends AiProvider>(props: {
		provider: T;
		model: (typeof DefaultAiModels)[T][number]["id"];
		credentials: AiInterfaceConstructor["credentials"];
		message: string;
		maxTokens?: {
			input: number;
			output: number;
		};
	}) => {
		const ai = this.client(props.provider)({
			model: props.model,
			credentials: props.credentials,
			conversations: [],
			preferences: {
				name: "summarizer",
				type: "worker",
				temperature: 0.1,
				toolOnly: true,
			},
			tokens: {
				maxLimit: props.maxTokens,
			},
			whitelistedTools: ["planner"],
		});

		await ai.tools.attachTools({
			type: "internal",
			tool: PlannerTool,
			isInternal: true,
		});

		const response = await ai.handleUserMessage(props.message);
		const messages = response.messages;
		const plan = JSON.parse(messages[messages.length - 1].content) as {
			isFeasible: boolean;
			queryClassification: "direct_answer" | "requires_tools" | "unclear";
			intentSummary: string;
			directResponse?: string;
			abortReason?: string;
			executionPhases?: Array<{
				phaseId: string;
				parallelNodes: Array<{
					nodeId: string;
					schemaOnly: boolean;
					instruction: string;
					tools: string[];
					dependsOn?: string[] | undefined;
				}>;
			}>;
		};

		return {
			plan,
			token: response.token,
		};
	};

	static executeWithPlanner = async <T extends AiProvider, Q extends AiProvider>(
		props: ExecuteWithPlannerProps<T, Q>,
		onEvent?: (props: IEventWithPayload<ExecuteWithPlannerEvents>) => void
	) => {
		const event = new IEvent<ExecuteWithPlannerEvents>();

		if (onEvent) {
			event.onEvery(e => onEvent(e));
		}

		const tokenCount = { input: 0, output: 0 };

		try {
			event.emit("status", "planning");
			const tools = new ToolManager({
				whitelist: props.whitelist,
			});

			await Promise.all(
				props.tools.map(async tool => {
					await tools.attachTools(tool);
				})
			);

			const pQuery = await this.planner({
				model: props.planner.model,
				provider: props.planner.provider,
				credentials: props.planner.credentials,
				maxTokens: props.planner.maxToken ?? {
					input: 20000,
					output: 20000,
				},
				message: `
      System message: ${props.systemMessage}
      User query: ${props.query}
      Tools_available: ${tools
				.getActiveTools()
				.map(t => `${t.name}: ${t.description}`)
				.join(", ")}
      Always end the plan with the end_response or execute_javascript tool unless answering directly.
    `,
			});

			tokenCount.input += pQuery.token?.input || 0;
			tokenCount.output += pQuery.token?.output || 0;
			event.emit("token", { ...tokenCount });

			if (!pQuery.plan?.isFeasible || pQuery.plan?.queryClassification === "unclear") {
				event.emit("status", "failed");
				event.emit("error", {
					reason: pQuery.plan?.abortReason || "Plan is not feasible",
				});
				return {
					result: pQuery.plan?.abortReason || "Plan is not feasible",
					token: tokenCount,
				};
			}

			if (pQuery.plan.queryClassification === "direct_answer" && pQuery.plan.directResponse) {
				event.emit("response", pQuery.plan.directResponse);
				event.emit("status", "completed");
				return {
					result: pQuery.plan.directResponse,
					token: tokenCount,
				};
			}

			event.emit("plan", {
				title: "Execution Plan Summary",
				description: pQuery.plan.intentSummary,
				executionPhases: pQuery.plan.executionPhases,
				queryClassification: pQuery.plan.queryClassification,
			});

			const executionMatrix = (pQuery.plan.executionPhases || []).map(phase =>
				phase.parallelNodes.map(node => node.nodeId)
			);
			event.emit("execution", executionMatrix);
			event.emit("status", "executing");

			const nodeResults = new Map<
				string,
				{
					name: string;
					response: string;
					token: {
						input: number;
						output: number;
					};
					schemaOnly: boolean;
					vars?: Array<{
						name: string;
						data: string;
						schema: object;
					}>;
				}
			>();

			for (const phase of pQuery.plan.executionPhases || []) {
				const phasePromises = phase.parallelNodes.map(async node => {
					event.emit("current", node.nodeId);
					const deps = (node.dependsOn?.map(dep => nodeResults.get(dep)!) || []).filter(e => e);

					const runner = Aix.client(props.provider)({
						conversations: [],
						model: props.model,
						credentials: props.credentials,
						preferences: {
							name: `Node Worker: ${node.nodeId}`,
							type: "worker",
							toolOnly: true,
							temperature: 0.1,
						},
						tokens: {
							maxLimit: { input: props.maxTokenPerExecution.input, output: props.maxTokenPerExecution.output },
							current: { input: 0, output: 0 },
							total: { input: 0, output: 0 },
						},
						internal: {
							system: { ...props.internal?.system, schemaOnly: node.schemaOnly },
							vars: new Map(deps.flatMap(dep => dep.vars?.map(e => [e.name, e]) || [])),
						},
						whitelistedTools: [...node.tools, "execute_javascript", "end_response"],
					});

					await Promise.all(
						props.tools.map(async tool => {
							await runner.tools.attachTools(tool);
						})
					);

					let isolatedPrompt = `System/Instruction:\n${node.instruction}\n\n`;

					if (node.dependsOn && node.dependsOn.length > 0) {
						isolatedPrompt += `Context from previous steps:\n`;
						for (const dep of deps) {
							const previousResult = dep.response || "No data returned.";
							if (!dep.schemaOnly) {
								isolatedPrompt += `--- Response from ${dep.name} ---\n${previousResult}\n`;
							}
							if (dep.vars?.length) {
								isolatedPrompt += `--- Vars from ${dep.name} with schema do not use {{vars.${dep.name}} ---\n`;
								for (const varItem of dep.vars) {
									isolatedPrompt += `--- ${varItem.name} ---\n${JSON.stringify(varItem.schema)}\n`;
								}
							}
						}
					}

					runner.on("tool.start", tool => {
						logger.info(`${node.nodeId}Tool started: ${tool.name}: ${JSON.stringify(tool.args)}`);
					});
					runner.on("tool.finish", tool => {
						logger.info(`${node.nodeId} \n${JSON.stringify(tool)}`);
					});

					const response = await runner.handleUserMessage(isolatedPrompt);

					const finalMessage = response.messages[response.messages.length - 1]?.content || "";
					const responseInputTokens = response.token?.input || 0;
					const responseOutputTokens = response.token?.output || 0;

					nodeResults.set(node.nodeId, {
						response: finalMessage,
						token: {
							input: responseInputTokens,
							output: responseOutputTokens,
						},
						vars:
							response.vars.map(([name, value]) => ({
								name,
								data: value.data,
								schema: value.schema,
							})) || [],
						name: node.nodeId,
						schemaOnly: node.schemaOnly,
					});

					tokenCount.input += responseInputTokens;
					tokenCount.output += responseOutputTokens;
					event.emit("token", {
						input: responseInputTokens,
						output: responseOutputTokens,
					});
				});

				const results = await Promise.allSettled(phasePromises);

				for (const result of results) {
					if (result.status === "rejected") {
						throw new Error(`Node execution failed: ${result.reason}`);
					}
				}
			}

			const phases = pQuery.plan.executionPhases || [];
			let finalResponseText = "";

			if (phases.length > 0) {
				const lastPhase = phases[phases.length - 1];
				const terminalNodeIds = lastPhase.parallelNodes.map(n => n.nodeId);
				finalResponseText = terminalNodeIds
					.map(id => nodeResults.get(id)?.response)
					.filter(Boolean)
					.join("\n\n");
			}

			event.emit("response", finalResponseText);
			event.emit("status", "completed");

			return {
				result: finalResponseText,
				token: tokenCount,
			};
		} catch (error: any) {
			event.emit("status", "error");
			event.emit("error", {
				reason: error.message || "An unknown error occurred during execution",
			});
			return {
				result: error.message || "An unknown error occurred during execution",
				token: tokenCount,
			};
		}
	};

	static structureResponse = async <T extends AiProvider, Z extends z.ZodObject>(props: {
		provider: T;
		model: (typeof DefaultAiModels)[T][number]["id"];
		credentials: AiInterfaceConstructor["credentials"];
		message: string;
		schema: Z;
		title?: string;
		description?: string;
		preference?: Partial<AiInterfaceConstructor["preferences"]>;
	}): Promise<{ data: z.infer<Z>; token: { input: number; output: number } }> => {
		try {
			const toolName = props.title || "structure_response";

			const structureResponseTool = new ITool({
				title: toolName,
				description: props.description || "Structures a response based on a schema.",
				schema: props.schema,
				run: input => {
					return [
						{ type: "text", text: JSON.stringify(input) },
						{
							type: "resource_link",
							uri: "return",
							name: "ResponseStructured",
							_meta: { return: { isCompleted: true, isError: false } },
						},
					];
				},
			});

			const ai = this.client(props.provider)({
				model: props.model,
				credentials: props.credentials,
				conversations: [],
				preferences: {
					...props.preference,
					name: "structure_response_ai",
					type: "worker",
					toolOnly: true,
					temperature: 0.1,
				},
				whitelistedTools: [toolName],
			});

			ai.onEvery(e => {
				logger.info(e);
			});

			await ai.tools.attachTools({
				type: "internal",
				tool: [structureResponseTool],
				isInternal: true,
			});

			const response = await ai.handleUserMessage(props.message);
			const messages = response.messages;
			const lastMessage = messages[messages.length - 1];

			if (!lastMessage || !lastMessage.content) {
				throw new Error("AI returned an empty response. Try increasing the token limit.");
			}
			let data: z.infer<Z>;
			try {
				data = JSON.parse(lastMessage.content) as z.infer<Z>;
			} catch (error) {
				throw new Error(`Failed to parse AI response as JSON. Raw output: ${lastMessage.content}`);
			}
			return {
				data,
				token: response.token || { input: 0, output: 0 },
			};
		} catch (error) {
			throw new Error(`Failed to structure response: ${error instanceof Error ? error.message : String(error)}`);
		}
	};
}

type BasePlannerProps<T extends AiProvider, Q extends AiProvider> = {
	query: string;
	systemMessage: string;
	tools: ToolConnector[];
	provider: T;
	whitelist: string[];
	model: (typeof DefaultAiModels)[T][number]["id"];
	internal: Partial<TInternal>;
	credentials: AiInterfaceConstructor["credentials"];
	maxTokenPerExecution: {
		input: number;
		output: number;
	};
	planner: {
		provider: Q;
		model: (typeof DefaultAiModels)[Q][number]["id"];
		credentials: AiInterfaceConstructor["credentials"];
		maxToken?: {
			input: number;
			output: number;
		};
	};
};

type SummarizerProps<S extends AiProvider> =
	| {
			summarizer: {
				provider: S;
				model: (typeof DefaultAiModels)[S][number]["id"];
				credentials: AiInterfaceConstructor["credentials"];
				summarizeAt: {
					input: number;
					output: number;
				};
			};
	  }
	| {
			summarizer?: never;
	  };

type ExecuteWithPlannerProps<T extends AiProvider, S extends AiProvider> = BasePlannerProps<T, S> & SummarizerProps<S>;

type ExecuteWithPlannerEvents = {
	token: {
		input: number;
		output: number;
	};
	status: "planning" | "summarizing" | "executing" | "completed" | "error" | "failed";
	plan: {
		title: string;
		description: string;
		queryClassification?: "direct_answer" | "requires_tools" | "unclear";
		executionPhases:
			| Array<{
					phaseId: string;
					parallelNodes: Array<{
						nodeId: string;
						schemaOnly: boolean;
						instruction: string;
						tools: string[];
						dependsOn?: string[] | undefined;
					}>;
			  }>
			| undefined;
	};
	execution: string[][];
	error: {
		reason: string;
	};
	current: string;
	response: string;
};
