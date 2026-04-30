import { InputData, jsonInputForTargetLanguage, quicktype } from "quicktype-core";

export class SchemaConvertor {
	static async generateSchemaQT(input: unknown) {
		try {
			let parsedObj: unknown;

			if (typeof input === "string") {
				try {
					parsedObj = JSON.parse(input);
				} catch {
					return {
						success: false,
						error: "Invalid JSON",
					};
				}

				if (typeof parsedObj === "string")
					return {
						success: false,
						error: "Invalid JSON",
					};
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

			const { lines } = await quicktype({
				inputData,
				lang: "schema",
				rendererOptions: {
					"just-types": "true",
					"no-ref": "true",
					"no-title": "true",
					"top-level": "Root",
				},
			});

			const schemaObj = JSON.parse(lines.join("\n"));
			const squeezedSchemaString = JSON.stringify(schemaObj);

			return {
				success: true,
				data: schemaObj as object,
				squeezedString: squeezedSchemaString,
			};
		} catch (e: any) {
			return {
				success: false,
				error: e.message,
			};
		}
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
