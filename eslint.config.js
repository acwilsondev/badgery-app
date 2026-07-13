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
      // Flags a pre-existing `templateLiteral || fallback` pattern in
      // progress.tsx where the left side is always truthy; the fallback is
      // dead code today, but fixing it changes behavior. Revisit in Phase 3.
      "no-constant-binary-expression": "off",
      // tailwind.config.ts loads plugins via require(); converting it to
      // static imports risks changing how the Tailwind/PostCSS pipeline
      // resolves the config. Revisit in Phase 3.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
