export const AiPrompt = {
	tool: {
		call: {
			success: (props: { toolName: string; args: string; isCompleted?: boolean; data: string; isError?: boolean }) =>
				props.isError
					? `${props.toolName} with args ${props.args}  returned ERROR ${props.data}`
					: props.isCompleted
						? props.data
						: `Tool ${props.toolName} with args ${props.args} returned ${props.data}`,
			successSchema: (props: { toolName: string; args: string; varName: string; schema: string }) =>
				`Tool call ${props.toolName} with args ${JSON.stringify(props.args)} responded with {{${props.varName}}\n\nSchema: ${JSON.stringify(props.schema)}\n\nCRITICAL INSTRUCTION: You MUST use the 'execute_javascript' tool to process this data. You must write valid JavaScript code with a 'return' statement.`,
		},
	},
};
