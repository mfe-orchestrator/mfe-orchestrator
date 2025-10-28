export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "chore",
        "docs",
        "test",
        "style",
        "refactor",
        "perf",
        "build",
        "ci",
        "revert",
      ],
    ],
    "subject-max-length": [2, "always", 80],
    "subject-min-length": [2, "always", 1],
    "subject-empty": [2, "never"],
    "subject-full-stop": [2, "never", "."],
    "header-max-length": [2, "always", 80],
  },
};
