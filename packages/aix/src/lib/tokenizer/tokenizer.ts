import { get_encoding } from "tiktoken";

// We get the encoding for a specific model, 'cl100k_base' is used by gpt-4, gpt-3.5-turbo, etc.
// It's best practice to instantiate the encoder once and reuse it.
const enc = get_encoding("cl100k_base");

export class Tokenizer {
	/**
	 * Returns the total number of tokens in the text.
	 * @param text The string to count tokens for.
	 * @returns The number of tokens.
	 */
	static count(text: string): number {
		return enc.encode(text).length;
	}

	/**
	 * Checks if the text is within a given token limit.
	 * @param text The string to check.
	 * @param limit The token limit (defaults to 4096).
	 * @returns True if the token count is within the limit, false otherwise.
	 */
	static isWithinLimit(text: string, limit: number = 4096): boolean {
		// Note: We encode and check length instead of calling count()
		// to avoid encoding the text twice if we needed the tokens later.
		// If you only need a boolean, Tokenizer.count(text) <= limit is fine.
		if (!text) return true;
		const tokens = enc.encode(text);
		return tokens.length <= limit;
	}

	/**
	 * Returns the array of token integers.
	 * @param text The string to tokenize.
	 * @returns An array of token numbers.
	 */
	static getTokens(text: string): number[] {
		const tokens = enc.encode(text);
		// The result from encode() is a Uint32Array, so we convert it to a standard number array.
		return Array.from(tokens);
	}

	/**
	 * It's good practice to free the encoder when it's no longer needed,
	 * especially in serverless environments or scripts that will terminate.
	 */
	static cleanup(): void {
		enc.free();
	}
}
