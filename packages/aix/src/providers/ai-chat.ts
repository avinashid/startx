import type { AiChatMessage, AiResource } from "./types.js";

export class AiChat {
	private messages: AiChatMessage[];
	private currentMessage: string;
	private resources: AiResource[] = [];
	constructor(msgs?: AiChatMessage[]) {
		this.messages = msgs || [];
		this.currentMessage = "";
	}
	public getMessages() {
		return this.messages;
	}

	public getResources() {
		return this.resources;
	}
	public addMessage(msg: AiChatMessage) {
		if (!this.currentMessage) this.currentMessage = msg.content;
		this.messages.push(msg);
	}
	public addResource(resource: AiResource[]) {
		this.resources.push(...resource);
	}
}
