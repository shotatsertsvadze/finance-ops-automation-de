import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist/", "storage/", "vendor/", "demo-video/", "node_modules/", "docs/", "Finance-Ops Abschlusspräsentation/"] },
  js.configs.recommended,
  { rules: { "no-unused-vars": ["error", { ignoreRestSiblings: true }] } },
  { languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...globals.node } } },
  { files: ["browser/**/*.js"], languageOptions: { globals: { ...globals.browser } } },
  {
    files: ["client/**/*.{js,jsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { "react-hooks/rules-of-hooks": "error", "react-hooks/exhaustive-deps": "warn" },
  },
];
