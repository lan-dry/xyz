// Node CLIs under tools/demo: shared base (TypeScript parser for .mts, Node globals for .mjs).
// Relative import: this tool package does not depend on @salanor/config.
import base from "../../packages/config/eslint/base.mjs";

export default [...base];
