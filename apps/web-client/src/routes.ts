import { type RouteConfig, index, route } from "@react-router/dev/routes";

// Keep the splat route last: it catches every path nothing else matched (B77).
export default [index("routes/home.tsx"), route("*", "routes/not-found.tsx")] satisfies RouteConfig;
