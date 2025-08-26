// eslint.config.js
import tseslint from "typescript-eslint"
import eslintPluginPrettier from "eslint-plugin-prettier"

export default [
    ...tseslint.configs.recommended,
    {
        plugins: {
            prettier: eslintPluginPrettier
        },
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.json"
            }
        },
        rules: {
            "@typescript-eslint/consistent-type-assertions": "off",
            "@typescript-eslint/no-floating-promises": "off",
            "@typescript-eslint/strict-boolean-expressions": "off",
            "@typescript-eslint/explicit-function-return-type": "off",
            "@typescript-eslint/naming-convention": "off"
        }
    }
]
