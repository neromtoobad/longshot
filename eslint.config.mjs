import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Root config covers the `shared` and `agent` workspaces.
// The `app` workspace lints itself with `next lint` (eslint-config-next).
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "app/**",
      "contracts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
