import { InputData, jsonInputForTargetLanguage, quicktype } from "quicktype-core";

export class SchemaConvertor {
	static async generateSchema(input: unknown): Promise<object | string> {
		let parsedObj: unknown;

		if (typeof input === "string") {
			try {
				parsedObj = JSON.parse(input);
			} catch {
				return input;
			}

			if (typeof parsedObj === "string") {
				return parsedObj;
			}
		} else {
			parsedObj = input;
		}

		const sample = JSON.stringify(parsedObj);
		const jsonInput = jsonInputForTargetLanguage("schema");

		await jsonInput.addSource({
			name: "Root",
			samples: [sample],
		});

		const inputData = new InputData();
		inputData.addInput(jsonInput);

		const { lines: schemaLines } = await quicktype({
			inputData,
			lang: "schema",
		});

		const parsed = JSON.parse(schemaLines.join("\n"));

		return parsed.definitions;
	}
	static jsonToSchema(input: unknown): { type: string; schema: object } {
		const parse = (data: unknown) => {
			if (typeof data === "string") {
				try {
					const parsed = JSON.parse(data);
					return typeof parsed === "string" ? parsed : parsed;
				} catch {
					return data;
				}
			}
			return data;
		};

		const infer = (value: any): any => {
			if (Array.isArray(value)) {
				return {
					type: "array",
					items: value.length ? infer(value[0]) : {},
				};
			}

			if (value === null) return { type: "null" };

			if (typeof value === "object") {
				const props: Record<string, any> = {};
				for (const k in value) {
					props[k] = infer(value[k]);
				}
				return {
					type: "object",
					properties: props,
				};
			}

			return { type: typeof value };
		};

		const parsed = parse(input);
		const schema = infer(parsed);
		return {
			type: schema.type,
			schema,
		};
	}
}
