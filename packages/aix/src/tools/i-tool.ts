import { z } from "zod";
import type { TInternal, ToolReturn } from "./types.js";

type Awaitable<T> = T | PromiseLike<T>;

export class ITool<S extends z.ZodObject = z.ZodObject> {
	readonly title: string;
	readonly description: string;
	readonly schema: S;

	private _run: (args: z.infer<S>, internal?: TInternal) => Awaitable<ToolReturn>;

	public run = async (rawArgs: unknown, internal: TInternal): Promise<ToolReturn> => {
		try {
			const parsed = this.schema.parse(rawArgs);
			return await this._run(parsed, internal);
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
			return [{ type: "text", text: message }];
		}
	};
	constructor(def: {
		title: string;
		description: string;
		schema: S;
		run: (args: z.infer<S>, internal?: TInternal) => Awaitable<ToolReturn>;
	}) {
		this.title = def.title;
		this.description = def.description;
		this.schema = def.schema;
		this._run = def.run;
	}
}
