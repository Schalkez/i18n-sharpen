import js from "@eslint/js"
import globals from "globals"
import tseslint from "typescript-eslint"
import importX from "eslint-plugin-import-x"
import unusedImports from "eslint-plugin-unused-imports"

export default tseslint.config(
  { ignores: ["dist", "node_modules", "**/*.d.ts"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "import-x": importX,
      "unused-imports": unusedImports,
    },
    rules: {
      // TypeScript strict overrides
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        fixStyle: "inline-type-imports"
      }],
      "@typescript-eslint/no-unused-vars": "off", // Handled by unused-imports plugin
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
        allowBoolean: true,
        allowAny: false,
        allowNullish: true
      }],
      "no-console": "off",

      // Unused imports rules
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          "vars": "all",
          "varsIgnorePattern": "^_",
          "args": "after-used",
          "argsIgnorePattern": "^_"
        }
      ],

      // Import rules
      "import-x/no-duplicates": "error",
      "import-x/order": [
        "error",
        {
          "groups": [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"]
          ],
          "pathGroups": [
            {
              "pattern": "@/**",
              "group": "internal"
            }
          ],
          "pathGroupsExcludedImportTypes": ["builtin"],
          "alphabetize": { "order": "asc", "caseInsensitive": true }
        }
      ],

      // Restrict relative imports going up (..) to enforce @/
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": ["../*"],
              "message": "Please use import alias '@/' instead of relative imports with '..'."
            }
          ]
        }
      ]
    }
  }
)
