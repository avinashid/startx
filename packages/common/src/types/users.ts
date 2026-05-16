export type SessionUserRole = "user" | "admin";

export type SessionUser = {
	id: string;
	email: string;
	fullName: string;
	role: SessionUserRole;
	currentProfile: SessionUserRole;
	accessToken: string;
};
