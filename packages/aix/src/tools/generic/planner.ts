import { z } from "zod";
import { ITool } from "../i-tool.js";

const ExecutionNodeSchema = z.object({
	nodeId: z.string().describe("Unique identifier (e.g., 'fetch_user_data')"),
	instruction: z
		.string()
		.describe(
			"Strict instruction. DO NOT hardcode/mock data. Reference injected dynamic variables (e.g., `vars.xyz`) directly in scripts/queries."
		),
	schemaOnly: z
		.boolean()
		.default(true)
		.describe("TRUE for large datasets (SQL, APIs). FALSE for final markdown responses or strictly small payloads."),
	tools: z.array(z.string()).describe("List of required tool names"),
	dependsOn: z.array(z.string()).optional().describe("Array of nodeIds that must resolve before execution"),
});

const ExecutionPhaseSchema = z.object({
	phaseId: z.string().describe("Sequential phase identifier (e.g., 'phase_1')"),
	parallelNodes: z.array(ExecutionNodeSchema).describe("Nodes executing concurrently in this phase"),
});

const PlannerSchema = z.object({
	isFeasible: z.boolean(),
	queryClassification: z
		.enum(["direct_answer", "requires_tools", "unclear"])
		.describe(
			"Classify intent. Use 'direct_answer' for abstract/general queries. Use 'requires_tools' for actionable workflows."
		),
	intentSummary: z.string(),
	directResponse: z
		.string()
		.optional()
		.describe("Populate ONLY if queryClassification is 'direct_answer'. Provides the final answer immediately."),
	executionPhases: z
		.array(ExecutionPhaseSchema)
		.optional()
		.describe("Populate ONLY if queryClassification is 'requires_tools'."),
	abortReason: z
		.string()
		.optional()
		.describe("Populate ONLY if isFeasible is false or queryClassification is 'unclear'."),
});

type PlannerInput = z.infer<typeof PlannerSchema>;

export const PlannerTool: ITool[] = [
	new ITool({
		title: "planner",
		description:
			"Evaluates queries and architects execution plans. Can bypass planning for abstract queries to provide direct answers. RULES: 1. Ensure dependent nodes use dynamic variable injection. 2. Prevent data hallucination in dependent nodes.",
		schema: PlannerSchema,
		run: (input: PlannerInput) => {
			try {
				const { isFeasible, queryClassification, intentSummary, directResponse, executionPhases, abortReason } = input;

				let payload;
				let eventName = "";
				let isError = false;

				if (!isFeasible || queryClassification === "unclear") {
					payload = { isFeasible, queryClassification, intentSummary, abortReason };
					eventName = "ExecutionAborted";
					isError = true;
				} else if (queryClassification === "direct_answer") {
					payload = { queryClassification, intentSummary, directResponse };
					eventName = "DirectAnswerResolved";
				} else {
					payload = { isFeasible, queryClassification, intentSummary, executionPhases };
					eventName = "PlanArchitected";
				}

				return [
					{
						type: "text",
						text: JSON.stringify(payload, null, 2),
					},
					{
						type: "resource_link",
						uri: "return",
						name: eventName,
						_meta: {
							return: {
								isCompleted: true,
								isError,
							},
						},
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);

				return [
					{
						type: "text",
						text: `Error processing plan: ${message}`,
					},
					{
						type: "resource_link",
						uri: "return",
						name: "PlanFailed",
						_meta: {
							return: {
								isCompleted: true,
								isError: true,
							},
						},
					},
				];
			}
		},
	}),
];
