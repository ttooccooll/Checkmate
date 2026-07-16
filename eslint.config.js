import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["dist/", "node_modules/", "public/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js"],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": ["error", { args: "none" }],
    },
  },
  {
    files: ["api/**/*.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["*.config.js"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Test files run under Node but page.evaluate callbacks execute in the
    // browser, so both sets of globals apply.
    files: ["tests/**/*.mjs"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
