import axios, { AxiosError, type AxiosInstance } from "axios";

type IAxiosClientOpts = {
	includeDefaultInterceptors?: boolean;
};

export abstract class IAxiosClient {
	public readonly privateClient: AxiosInstance;
	public readonly publicClient: AxiosInstance;
	protected accessToken: string | null = null;
	protected opts: IAxiosClientOpts;
	constructor(baseURL: string, opts: IAxiosClientOpts) {
		this.publicClient = axios.create({ baseURL });

		this.privateClient = axios.create({
			baseURL,
			withCredentials: true,
		});
		this.opts = opts;

		this.defaultInterceptors();
		this.setupInterceptors();
	}

	protected defaultInterceptors(): void {
		if (!this.opts.includeDefaultInterceptors) return;
		this.privateClient.interceptors.request.use(
			config => {
				if (this.accessToken) {
					config.headers.Authorization = `Bearer ${this.accessToken}`;
				}
				return config;
			},
			(error: AxiosError) => Promise.reject(error)
		);
	}

	abstract setupInterceptors(): void;
	abstract getAccessToken(): Promise<string>;
}
