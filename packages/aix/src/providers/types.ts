export type AiProvider = "groq" | "openAi" | "cloudflare" | "gemini" | "anthropic";

export type AiChatRole = "user" | "system" | "assistant";

export type AiChatMessage =
	| {
			role: AiChatRole;
			content: string;
			timestamp: Date;
	  }
	| {
			role: "tool";
			content: string;
			tool_call_id: string;
			timestamp: Date;
	  };

export type AiResource =
	| {
			type: "table";
			data: Array<Record<string, unknown>>;
			columns?: string[];
			meta?: {
				rowCount?: number;
			};
	  }
	| {
			type: "image";
			source: { kind: "url"; url: string } | { kind: "base64"; data: string; mimeType?: string };
			alt?: string;
			meta?: {
				width?: number;
				height?: number;
			};
	  }
	| {
			type: "file";
			source: { kind: "url"; url: string } | { kind: "base64"; data: string; mimeType?: string };
			name?: string;
			size?: number;
			meta?: {
				extension?: string;
			};
	  };
