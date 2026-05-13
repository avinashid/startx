import type { SessionUser, SessionUserRole } from "@repo/common/types/users";
import { useEffect } from "react";
import { create } from "zustand";
import { axiosClient } from "../axios-client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AuthState {
	status: AuthStatus;
	role?: SessionUserRole;
	user: SessionUser | null;
}

interface AuthActions {
	updateStatus(status: AuthStatus): void;
	updateUser(user: SessionUser | null): void;
	reset(): void;
}

export const useAuthStore = create<AuthState & AuthActions>(set => ({
	status: "loading",
	user: null,
	role: undefined,

	updateStatus: status =>
		set({
			status,
		}),

	updateUser: user =>
		set({
			user,
			role: user?.role,
			status: user ? "authenticated" : "unauthenticated",
		}),

	reset: () =>
		set({
			user: null,
			role: undefined,
			status: "unauthenticated",
		}),
}));

export const AuthStartup = () => {
	useEffect(() => {
		const initAuth = async () => {
			try {
				await axiosClient.getAccessToken();
			} catch {
				useAuthStore.getState().reset();
			}
		};

		void initAuth();
	}, []);

	return null;
};
