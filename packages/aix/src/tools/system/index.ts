import * as vm from "node:vm";
import { z } from "zod";
import { ITool } from "../i-tool.js";

export const SystemInternalTools: ITool[] = [
	new ITool({
		title: "end_response",
		description: "Call this tool if you want to end the response to the user.",
		schema: z.object({
			note: z
				.string()
				.describe(
					"Answer the user query with a note in professional way that has the task summary and the response of what user asked you can also use variable and perform js-operations on them. A valid variable format is {{message.VARIABLE_NAME}}."
				),
		}),
		run: ({ note }: { note: string }) => {
			try {
				return [
					{
						type: "text",
						text: `${note}`,
					},
					{
						type: "resource_link",
						uri: "return",
						name: note,
						_meta: {
							return: {
								isCompleted: true,
								isError: false,
							},
						},
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [{ type: "text", text: `Error fetching forecast: ${message}` }];
			}
		},
	}),

	new ITool({
		title: "no_relevant_tool",
		description:
			"Call this tool if there is no relevant tool that can help you to complete this task. Please respond to user query in professional way.",
		schema: z.object({
			note: z.string().describe("Please respond to the user query."),
		}),
		run: ({ note }: { note: string }) => {
			try {
				return [
					{
						type: "text",
						text: `${note}`,
					},
					{
						type: "resource_link",
						uri: "return",
						name: note,
						_meta: {
							return: {
								isCompleted: true,
								isError: false,
							},
						},
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [{ type: "text", text: `Error fetching forecast: ${message}` }];
			}
		},
	}),

	// new ITool({
	// 	title: "continue_response",
	// 	description:
	// 		"Call this tool if some parts of job is done and there is next action to be taken make sure it doesn't involve user interaction.",
	// 	schema: z.object({
	// 		note: z.string().describe("Please provide a proper note of the next execution"),
	// 	}),
	// 	run: ({ note }: { note: string }) => {
	// 		try {
	// 			return [
	// 				{
	// 					type: "text",
	// 					text: `${note}`,
	// 				},
	// 			];
	// 		} catch (err: unknown) {
	// 			const message = err instanceof Error ? err.message : String(err);
	// 			return [{ type: "text", text: `Error fetching forecast: ${message}` }];
	// 		}
	// 	},
	// }),

	new ITool({
		title: "error_response",
		description: "Call this tool if the job is failed because of some errors.",
		schema: z.object({
			note: z.string().describe("Please provide a proper error with a note how to solve this error."),
		}),
		run: ({ note }: { note: string }) => {
			try {
				return [
					{
						type: "text",
						text: `${note}`,
					},
					{
						type: "resource_link",
						uri: "return",
						name: note,
						_meta: {
							return: {
								isCompleted: true,
								isError: true,
							},
						},
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [{ type: "text", text: `Error fetching forecast: ${message}` }];
			}
		},
	}),

	new ITool({
		title: "get_data_by_tool_id",
		description: `
        Write JavaScript logic using {{data}} as the dataset variable.
        You can use top‑level statements (const, loops, etc.).
        **You must include a return statement** in your operation.

        When performing operation make everything **case insensitive** so that 10mg or 10 mg or 10Mg are all considered the same.
        Always handle variable that has null or undefined values.
        Example:
          const filtered = {{data}}.filter(x => x.active);
          return filtered.map(x => x.name);
    `,
		schema: z.object({
			toolId: z.string().describe("ID of the structure data to fetch."),
			operation: z.string().describe("JS function body using {{data}}. Must include return."),
		}),
		run: async ({ toolId, operation }, internal) => {
			try {
				const DATA_VAR = "DATA_PLACEHOLDER";
				const data = internal?.toolData?.[toolId];

				if (!data) {
					throw new Error(`No data found for structureDataId: ${toolId}`);
				}

				const functionBody = operation.replaceAll("{{data}}", DATA_VAR);

				const context = vm.createContext({
					[DATA_VAR]: data,
				});

				const script = new vm.Script(`
          (async () => {
            ${functionBody}
          })();
        `);

				const result = (await script.runInContext(context)) as unknown;

				return [
					{
						type: "text",
						text: `✅ Success: structureDataId \`${toolId}\`.`,
					},
					{ type: "text", text: JSON.stringify(result, null, 2) },
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [{ type: "text", text: `❌ Error: ${message}` }];
			}
		},
	}),
	new ITool({
		title: "execute_javascript",
		description: `
    Executes JavaScript code in a sandboxed VM. Use this tool for ANY JavaScript execution, including mathematical calculations, logical operations, data processing, and resolving variables provided in the user's prompt.

    CRITICAL INSTRUCTIONS:
    1. SYNTAX FOR VARIABLES: If referencing dataset variables from the prompt, you MUST use the exact format: {{vars.VARIABLE_NAME}}. Only use this syntax if a variable actually exists in the prompt.
    2. RETURN STATEMENT: Your code is executed in an async IIFE and MUST include a top-level 'return' statement with the final result.
    3. RESILIENCE: Always handle potential null, undefined, or edge cases gracefully.
    4. COMPLETION FLAG ('isCompleted'):
       - Set to TRUE if this execution fully resolves the user's query. If true, your script MUST return a cleanly formatted Markdown string ready to be shown to the user.
       - Set to FALSE if you only need to extract/calculate intermediate data for your own further reasoning.

    EXAMPLE 1 (Math):
    return Math.sqrt(144) + 5;

    EXAMPLE 2 (Variables):
    const data = {{vars.MEDICATIONS}} || [];
    const filtered = data.filter(item => item && item.dose && item.dose.toLowerCase().replace(' ', '') === '10mg');
    return filtered.map(item => \`- \${item.name}\`).join('\\n');

		Mark isCompleted as true if this operation fully resolves the user's request (script must return formatted Markdown).
  `.trim(),
		schema: z.object({
			operation: z
				.string()
				.describe(
					"Valid JavaScript code. MUST contain a 'return' statement. Do not include markdown code blocks (```javascript) in this string."
				),
			isCompleted: z
				.boolean()
				.describe(
					"Set to true if this operation fully resolves the user's request (script must return formatted Markdown). Set to false if extracting intermediate data."
				),
		}),
		run: async ({ isCompleted, operation }, internal) => {
			try {
				const contextObj: Record<string, unknown> = {};
				let resolvedOp = operation;

				resolvedOp = resolvedOp
					.replace(/^```javascript\n/, "")
					.replace(/^```js\n/, "")
					.replace(/\n```$/, "");

				for (const [key, value] of internal?.vars.entries() || []) {
					const sanitized = key;

					// Attempt to parse stringified JSON data before injecting into the VM
					let contextValue = value.data;
					if (typeof contextValue === "string") {
						try {
							contextValue = JSON.parse(contextValue);
						} catch {
							// Leave as string if not valid JSON
						}
					}

					contextObj[sanitized] = contextValue;

					const placeholder = new RegExp(`\\{\\{vars\\.${key}\\}\\}`, "g");
					resolvedOp = resolvedOp.replace(placeholder, sanitized);
				}

				const context = vm.createContext(contextObj);

				const script = new vm.Script(`
        (async () => {
          ${resolvedOp}
        })();
      `);

				const result = (await script.runInContext(context)) as unknown;
				const textResult = JSON.stringify(result)?.length > 3 ? result : "No data found";

				if (isCompleted) {
					return [
						{
							type: "text",
							text: String(textResult),
						},
						{
							type: "resource_link",
							uri: "return",
							name: "Execution completed",
							_meta: {
								return: {
									isCompleted: true,
									isError: false,
								},
							},
						},
					];
				}

				return [{ type: "text", text: JSON.stringify(textResult, null, 2) }];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [
					{ type: "text", text: `❌ Error: ${message}` },
					{
						type: "resource_link",
						uri: "return",
						name: "Execution failed",
						_meta: {
							return: {
								isCompleted: false,
								isError: true,
							},
						},
					},
				];
			}
		},
	}),
];
