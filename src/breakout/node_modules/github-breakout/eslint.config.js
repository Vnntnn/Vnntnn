// ESLint 9.x+ flat config for TypeScript + Prettier

const ts = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const prettier = require("eslint-plugin-prettier");

// Import recommended configs
const tsRecommended = require("@typescript-eslint/eslint-plugin").configs
  .recommended;
const prettierRecommended = require("eslint-plugin-prettier").configs
  .recommended;

module.exports = [
  { ignores: ["node_modules", "dist"] },
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": ts,
      prettier,
    },
    rules: {
      ...tsRecommended.rules,
      ...prettierRecommended.rules,
      "prettier/prettier": "error",
    },
  },
  {
    files: ["eslint.config.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
