import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "db/migrations/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      // The codebase is full of `any` from its prototype days; cleaning that
      // up is Phase 3 work, not a lint gate.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // tailwind.config.ts loads plugins via require() — converting it to
    // static imports risks changing how the Tailwind/PostCSS pipeline
    // resolves the config, so this stays scoped to just this one file
    // rather than off repo-wide (Phase 3 cleanup, see the Phase 0 note
    // this closes out).
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
