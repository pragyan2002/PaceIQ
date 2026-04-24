export default [
  {
    ignores: ["dist/**", "node_modules/**"],
  },
  {
    files: ["**/*.js", ".github/workflows/*.yml"],
    rules: {
      "no-console": "off",
    },
  },
];
