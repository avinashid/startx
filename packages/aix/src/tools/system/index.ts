import * as vm from "node:vm";
import { z } from "zod";
import { ITool } from "../i-tool.js";

export type TInternal = {
	sessionId: string;
	vars: Record<string, unknown>;
	toolData: Record<string, unknown>;
};

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

	new ITool({
		title: "continue_response",
		description:
			"Call this tool if some parts of job is done and there is next action to be taken make sure it doesn't involve user interaction.",
		schema: z.object({
			note: z.string().describe("Please provide a proper note of the next execution"),
		}),
		run: ({ note }: { note: string }) => {
			try {
				return [
					{
						type: "text",
						text: `${note}`,
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);
				return [{ type: "text", text: `Error fetching forecast: ${message}` }];
			}
		},
	}),

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
		title: "variable_resolver",
		description: `
        Write JavaScript logic using {{message.VARIABLE_NAME}} as the dataset variable.
        Use this if you've actual variable name in format {{variable_name}} specifically.
        You can use top‑level statements (const, loops, etc.).
        **You must include a return statement** in your operation.
        ❗ Only call this tool if a variable in {{...}} format actually exists in the message.
        If no such variable exists, DO NOT call this tool.
        When performing operation make everything **case insensitive** so that 10mg or 10 mg or 10Mg are all considered the same.
        Always handle variable that has null or undefined values.
        When isCompleted is true return proper markdown formatting for easier reading to the user.
        Example:
          const filtered = {{message.VARIABLE_NAME}}.filter(x => x.active);
          return filtered.map(x => x.name);
    `,
		schema: z.object({
			operation: z
				.string()
				.describe(
					"JS function body using {{message.VARIABLE_NAME}}. Must include return and VARIABLE_NAME. When is completed is true make sure to add proper formatting."
				),
			isCompleted: z.boolean().describe("True if the operation would fulfill user request. False otherwise"),
		}),
		run: async ({ isCompleted, operation }, internal) => {
			try {
				const contextObj: Record<string, unknown> = {};
				let resolvedOp = operation;

				for (const [key, value] of Object.entries(internal?.vars || {})) {
					const sanitized = ("VAR_" + key).replace(/[^a-zA-Z0-9_]/g, "_").toUpperCase();

					contextObj[sanitized] = value;
					const placeholder = new RegExp(`\\{\\{message\\.${key}\\}\\}`, "g");
					resolvedOp = resolvedOp.replace(placeholder, sanitized);
				}

				const context = vm.createContext(contextObj);

				const script = new vm.Script(`
          (async () => {
            ${resolvedOp}
          })();
        `);

				const result = (await script.runInContext(context)) as unknown;
				const textResult = JSON.stringify(result).length > 3 ? result : "No data found";

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
									isError: true,
								},
							},
						},
					];
				}

				return [
					{
						type: "resource_link",
						uri: "user_message",
						name: "User message",
						_meta: {
							message: "operation on variable successful you can use this data to complete user query.",
						},
					},
					{ type: "text", text: JSON.stringify(textResult, null, 2) },
				];
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
