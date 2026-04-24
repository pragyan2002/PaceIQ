export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs"],
    rules: {
      "no-console": "off",
    },
  },
];
