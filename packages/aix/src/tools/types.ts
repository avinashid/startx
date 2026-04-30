import { z } from "zod";
import type { ITool } from "./i-tool.js";

type Awaitable<T> = T | PromiseLike<T>;

export type ToolDefine<TSchema extends z.ZodObject<any> = z.ZodObject<any>> = {
	title: string;
	description: string;
	schema: TSchema;
};

type MetaBase = {
	return?: {
		isCompleted?: boolean;
		isError?: boolean;
	};
	[key: string]: unknown;
};

type ResourceLinkBase<TUri extends string, TMetaPayload = Record<string, never>> = {
	type: "resource_link";
	uri: TUri;
	name: string;
	description?: string;
	title?: string;
	mimetype?: string;
	_meta: MetaBase & TMetaPayload;
};

type TableResource = ResourceLinkBase<
	"table",
	{
		data: Array<Record<string, unknown>>;
		columns?: string[];
	}
>;

type ImageResource = ResourceLinkBase<
	"image",
	{
		source: { kind: "url"; url: string } | { kind: "base64"; data: string; mimeType?: string };
		alt?: string;
		width?: number;
		height?: number;
	}
>;

type UserMessageResource = ResourceLinkBase<
	"user_message",
	{
		message: string;
	}
>;

type FileResource = ResourceLinkBase<
	"file",
	{
		source: { kind: "base64"; data: string; mimeType?: string };
	}
>;

type ReturnResource = ResourceLinkBase<
	"return",
	{
		result?: unknown;
		return: {
			isCompleted: boolean;
			isError: boolean;
		};
	}
>;

export type ResourceLink = TableResource | ImageResource | UserMessageResource | FileResource | ReturnResource;
export type ToolReturn = Array<{ type: "text"; text: string } | ResourceLink>;

export type ToolConnector =
	| {
			type: "mcp";
			serverPath: string;
			isInternal: boolean;
			headers?: Record<string, string>;
			sessionId?: string;
	  }
	| {
			type: "internal";
			isInternal: boolean;
			tool: Array<ITool<z.ZodObject<any>>>;
	  };

export type TInternal =
	| {
			vars: Map<
				string,
				{
					data: string;
					schema: object;
				}
			>;
			system?: Record<string, string | number | boolean>;
			toolData?: Record<string, unknown>;
	  }
	| undefined;

export type GenericTool<TSchema extends z.ZodObject<any> = z.ZodObject<any>> = {
	name: string;
	description: string;
	schema: TSchema;
	run: (args: z.infer<TSchema>, internal?: TInternal) => Awaitable<ToolReturn>;
};
