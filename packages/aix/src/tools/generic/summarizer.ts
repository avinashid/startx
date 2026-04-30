import { z } from "zod";
import { ITool } from "../i-tool.js";

export const SummarizerTool: ITool[] = [
	new ITool({
		title: "query-summarizer",
		description:
			"Acts as a professional query architect. Evaluates the user's raw prompt for feasibility, summarizes the core intent, and outputs a highly optimized, dense step-by-step execution plan along with the specific tools required. If the request is unfeasible, ambiguous, or out of scope, it provides a clear abort reason.",
		schema: z.object({
			isFeasible: z
				.boolean()
				.describe("True if the query can be executed with available tools, false if it must be aborted."),
			intentSummary: z.string().describe("A concise, professional summary of the user's core objective."),
			executionPlan: z
				.string()
				.optional()
				.describe(
					"A dense, highly compressed step-by-step execution plan or raw database query. Omit all filler words."
				),
			requiredTools: z
				.array(z.string())
				.optional()
				.describe("An array of specific tool names required to complete the execution plan."),
			abortReason: z
				.string()
				.optional()
				.describe("If isFeasible is false, provide a clear, actionable reason why the query cannot be executed."),
		}),
		run: ({ isFeasible, intentSummary, executionPlan, requiredTools, abortReason }) => {
			try {
				const payload = isFeasible
					? { isFeasible, intentSummary, executionPlan, requiredTools }
					: { isFeasible, intentSummary, abortReason };

				return [
					{
						type: "text",
						text: JSON.stringify(payload),
					},
					{
						type: "resource_link",
						uri: "return",
						name: isFeasible ? "PlanGenerated" : "ExecutionAborted",
						_meta: {
							return: { isCompleted: true, isError: false },
						},
					},
				];
			} catch (err: unknown) {
				return [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
					{
						type: "resource_link",
						uri: "return",
						name: "ToolFailure",
						_meta: {
							return: { isCompleted: true, isError: true },
						},
					},
				];
			}
		},
	}),
	new ITool({
		title: "general-summarizer",
		description: "Summarizes a given query or text into a short and precise format.",
		schema: z.object({
			summary: z.string().describe("The short, precise summary of the input query."),
		}),
		run: ({ summary }) => {
			try {
				return [
					{
						type: "text",
						text: JSON.stringify({ summary }),
					},
					{
						type: "resource_link",
						uri: "return",
						name: "Summarized",
						_meta: {
							return: { isCompleted: true, isError: false },
						},
					},
				];
			} catch (err: unknown) {
				return [
					{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` },
					{
						type: "resource_link",
						uri: "return",
						name: "Failed",
						_meta: {
							return: { isCompleted: true, isError: true },
						},
					},
				];
			}
		},
	}),
];
