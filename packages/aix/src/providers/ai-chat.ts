import type { AiChatMessage, AiResource } from "./types.js";

export class AiChat {
	private messages: AiChatMessage[];
	private resources: AiResource[] = [];
	constructor(msgs?: AiChatMessage[]) {
		this.messages = msgs || [];
	}
	public getMessages() {
		return this.messages;
	}
	public getResources() {
		return this.resources;
	}
	public addMessage(msg: AiChatMessage) {
		this.messages.push(msg);
	}
	public addResource(resource: AiResource[]) {
		this.resources.push(...resource);
	}
}
