import type { AiInterfaceConstructor } from "./ai-interface.js";
import { OpenAIClient } from "./openai/openai.js";
import type { AiProvider } from "./types.js";

export function aix<T extends AiProvider>(type: T) {
	return (props: AiInterfaceConstructor) => {
		switch (type) {
			case "openAi":
				return new OpenAIClient(props);
			default:
				throw new Error("Provider not implemented");
		}
	};
}
