import type { AiInterfaceConstructor } from "./ai-interface.js";
import { OpenAIClient } from "./openai/openai.js";
import type { AiProvider } from "./types.js";
export function aiProvider<T extends AiProvider>(type: T) {
	return (props: AiInterfaceConstructor) => {
		switch (type) {
			case "openAi":
				return new OpenAIClient(props);
			case "anthropic":
				return new OpenAIClient({
					...props,
					credentials: {
						apiKey: props.credentials.apiKey,
						baseUrl: props.credentials.baseUrl || "https://api.anthropic.com/v1",
					},
				});
			case "groq":
				return new OpenAIClient({
					...props,
					credentials: {
						apiKey: props.credentials.apiKey,
						baseUrl: props.credentials.baseUrl || "https://api.groq.com/openai/v1",
					},
				});
			case "cerebras":
				return new OpenAIClient({
					...props,
					credentials: {
						apiKey: props.credentials.apiKey,
						baseUrl: props.credentials.baseUrl || "https://api.cerebras.ai/v1/",
					},
				});
			case "cloudflare":
				return new OpenAIClient(props);
			default:
				throw new Error("Provider not implemented");
		}
	};
}
