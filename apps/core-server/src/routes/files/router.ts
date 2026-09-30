import { static as expressStatic, type NextFunction, type Request, type Response, Router } from "express";

import { STORAGE_ROOT } from "@/config/server-config.js";
import { AuthMiddlewares } from "@/middlewares/auth-middleware.js";

/**
 * Ownership model: `STORAGE_ROOT/<userId>/…`. A session may read only the subtree named after its
 * own user id, so authentication means isolation rather than a shared key to the whole sink —
 * write uploads into that layout. Anything needing wider reach — public assets, per-object grants,
 * a URL a browser can put in an `<img>` — belongs behind signed URLs or a separate public root.
 */
function enforceOwnership(req: Request, res: Response, next: NextFunction) {
	const deny = () => {
		res.status(403).json({
			success: false,
			message: "You do not have access to this file",
		});
	};

	let decoded: string;

	try {
		decoded = decodeURIComponent(req.path);
	} catch {
		deny();
		return;
	}

	// Decode first, then reject `..` outright: the prefix is checked against the raw path, but
	// express.static normalises before it resolves, so `/<own-id>/../<other-id>/x` would otherwise
	// pass the prefix check and then read someone else's subtree.
	const segments = decoded.split("/").filter((segment) => segment.length > 0);

	if (segments.includes("..") || segments[0] !== req.user.id) {
		deny();
		return;
	}

	next();
}

export function createFilesRouter(): Router {
	const router = Router();

	router.use(AuthMiddlewares.validateActiveSession);
	router.use(enforceOwnership);

	router.get(
		"/*splat",
		expressStatic(STORAGE_ROOT, {
			dotfiles: "deny",
			index: false,
			redirect: false,
			setHeaders: (res) => {
				// Uploads are untrusted bytes served from the API's own origin. Without this an
				// uploaded .html renders in place, and `script-src 'self'` then treats anything it
				// pulls from this origin as first-party.
				res.setHeader("Content-Disposition", "attachment");
			},
		}),
	);

	return router;
}
