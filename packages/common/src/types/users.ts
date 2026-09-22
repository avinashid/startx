export type SessionUserRole = "user" | "admin";

export type SessionUser = {
	id: string;
	email: string;
	fullName: string;
	role: SessionUserRole;
	currentProfile: SessionUserRole;
	accessToken: string;
};

/**
 * The user as persisted in a session record and attached to `req.user`.
 * An access token is issued per request and is never stored in the session.
 */
export type RequestUser = Omit<SessionUser, "accessToken">;
