import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        // Global injected by the Alt1 toolkit at runtime.
        alt1: "readonly",
      },
    },
    rules: {
      // TypeScript already checks for undefined references.
      "no-undef": "off",
      // webpack loads asset modules via require().
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: ["test/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettier,
);
