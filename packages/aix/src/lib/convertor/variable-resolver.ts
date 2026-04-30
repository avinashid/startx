import { getQuickJS } from "quickjs-emscripten";

export class VariableResolver {
	static extractPlaceholders(text: string): string[] {
		const matches = [...text.matchAll(/{{(.*?)}}/g)];
		return matches.map(m => m[1]?.trim() || "");
	}

	static async evaluateInQuickJS(expression: string, context: Record<string, any>): Promise<any> {
		const qjs = await getQuickJS();
		const vm = qjs.newContext();

		try {
			const global = vm.global;

			for (const scopeKey of Object.keys(context)) {
				const scopeObject = vm.newObject();

				for (const varKey of Object.keys(context?.[scopeKey])) {
					const value = context?.[scopeKey]?.[varKey];
					let valueHandle;

					if (typeof value === "function") {
						const fnCode = `(${value.toString()})`;
						const fnEval = vm.evalCode(fnCode);
						if (fnEval.error) {
							console.warn(`Function eval failed: ${fnCode}`);
							continue;
						}
						valueHandle = fnEval.value;
					} else {
						const json = value instanceof Date ? `"${value.toISOString()}"` : JSON.stringify(value);
						const valEval = vm.evalCode(json);
						if (valEval.error) {
							console.warn(`Value eval failed: ${json}`);
							continue;
						}
						valueHandle = valEval.value;
					}

					vm.setProp(scopeObject, varKey, valueHandle);
					valueHandle.dispose();
				}

				vm.setProp(global, scopeKey, scopeObject);
				scopeObject.dispose();
			}

			const wrappedExpr = `
        (function() {
          let val = ${expression};
          while (typeof val === 'function') {
            val = val();
          }
          return val;
        })()
      `;
			const resultEval = vm.evalCode(wrappedExpr);
			if (resultEval.error) {
				console.warn(`Expression eval failed:`, resultEval.error);
				return expression;
			}

			const result = vm.dump(resultEval.value);
			resultEval.value.dispose();
			return result;
		} catch (error) {
			console.warn("QuickJS error:", error);
			return expression;
		} finally {
			vm.dispose();
		}
	}
	static async resolveText(text: string, context: Record<string, any>): Promise<string> {
		const placeholders = this.extractPlaceholders(text);

		const replacements = await Promise.all(
			placeholders.map(async expr => {
				try {
					const result = await this.evaluateInQuickJS(expr, context);
					return {
						expr,
						result,
						valid: result !== expr && result !== undefined,
					};
				} catch (e) {
					return { expr, result: "", valid: false };
				}
			})
		);

		let resolved = text;
		for (const { expr, result, valid } of replacements) {
			if (valid) {
				resolved = resolved.replace(`{{${expr}}}`, String(result));
			}
		}
		return resolved;
	}

	static async resolveMessageVariables({
		messages,
		variables: variablesFromDb,
	}: {
		messages: Array<{ content: string; role: string; timestamp?: Date | null }>;
		variables: Array<{
			key: string;
			type: "string" | "number" | "boolean" | "object" | "array" | "fn";
			data: string;
			access: "user" | "agent" | "system" | "message";
		}>;
	}) {
		const messageVars = messages.flatMap(m => this.extractPlaceholders(m.content));
		const allExpressions = [...new Set([...messageVars])];
		const rootKeys = new Set(allExpressions.map(e => e.split(".")[0]));

		const context: Record<string, any> = {
			user: {},
			agent: {},
			system: {},
			message: {},
		};

		for (const v of variablesFromDb) {
			if (!rootKeys.has(v.access)) continue;

			try {
				let parsed: any;
				if (v.type === "fn") {
					parsed = eval(`(function() {
            return (function() {
              ${v.data}
            });
          })()`);
				} else if (v.type === "object" || v.type === "array") {
					parsed = JSON.parse(v.data);
				} else if (v.type === "number") {
					parsed = Number(v.data);
				} else if (v.type === "boolean") {
					parsed = v.data === "true";
				} else {
					parsed = v.data;
				}

				if (!context[v.access]) context[v.access] = {};
				context[v.access][v.key] = parsed;
			} catch (e) {
				console.warn(`Failed to parse variable ${v.key}`, e);
			}
		}

		const resolvedMessages = await Promise.all(
			messages.map(async msg => ({
				...msg,
				content: await this.resolveText(msg.content, context),
			}))
		);

		return resolvedMessages;
	}
}
