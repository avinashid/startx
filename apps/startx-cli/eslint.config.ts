import { baseConfig } from "eslint-config/base";
import { extend } from "eslint-config/extend";

// `bin/` is this package's tsdown outDir, not source. Ignored here rather than in the shared base
// config, because that config ships to generated workspaces where `bin/` is hand-written source.
export default extend(baseConfig, { ignores: ["bin/**"] });
