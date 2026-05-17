import type { SessionUser } from "@repo/common/types/users";
import { IAxiosClient } from "@repo/ui/api/axios/i-client";
import type { AxiosError, InternalAxiosRequestConfig } from "axios";
import { useAuthStore } from "./auth/auth-state";
import { ENV } from "./env";

type RetryableRequest = InternalAxiosRequestConfig & {
	_retry?: boolean;
};

class AxiosClient extends IAxiosClient {
	private refreshPromise: Promise<string> | null = null;

	async getAccessToken(): Promise<string> {
		const authStore = useAuthStore.getState();

		try {
			const response = await this.publicClient.get<{
				accessToken: string;
				user: SessionUser;
			}>("/api/auth/token", {
				withCredentials: true,
			});

			this.accessToken = response.data.accessToken;

			authStore.updateUser(response.data.user);

			return this.accessToken;
		} catch (error) {
			console.error("Token refresh failed:", error);

			this.accessToken = "";
			authStore.reset();

			return "";
		}
	}

	private async refreshToken(): Promise<string> {
		if (!this.refreshPromise) {
			this.refreshPromise = this.getAccessToken().finally(() => {
				this.refreshPromise = null;
			});
		}

		return await this.refreshPromise;
	}

	setupInterceptors(): void {
		this.privateClient.interceptors.response.use(
			response => response,
			async (error: AxiosError) => {
				const originalRequest = error.config as RetryableRequest | undefined;

				if (!originalRequest) {
					throw error;
				}

				if (originalRequest.url?.includes("/api/auth/token")) {
					throw error;
				}

				if (error.response?.status === 401 && !originalRequest._retry) {
					originalRequest._retry = true;

					const token = await this.refreshToken();

					if (!token) {
						throw error;
					}

					originalRequest.headers = originalRequest.headers ?? {};
					originalRequest.headers.Authorization = `Bearer ${token}`;

					return await this.privateClient(originalRequest);
				}

				throw error;
			}
		);
	}
}

export const axiosClient = new AxiosClient(ENV.SERVER_URL, {
	includeDefaultInterceptors: true,
});
