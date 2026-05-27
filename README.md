# i18n-sharpen ⚡️

A lightning-fast, zero-dependency, and configuration-driven CLI tool & library to **validate**, **extract**, and **prune** i18n translation keys in JS/TS codebases.

Keep your locale files clean, synchronized, and type-safe with ease.

---

## Key Features

1.  **Strict Quality Validation (`validate`)**:
    *   Detects missing translation keys used in source code.
    *   **Active Placeholder Detection**: Catches keys whose value is equal to their dot-notation path (meaning they are still untranslated placeholders).
    *   **Cross-Locale Key Alignment**: Ensures that all translation JSON files have the exact same keys as the default language file.
2.  **Automatic Key Extraction (`extract`)**:
    *   Scans codebase for translation patterns and automatically appends missing keys to all JSON files while maintaining formatting.
3.  **Safe Key Pruning (`prune`)**:
    *   Detects unused keys in JSON files and safely removes them to reduce bundle size.
4.  **CI/CD Markdown Reports**:
    *   Generates a clean quality and coverage report (`i18n-coverage.md`) ideal for PR comments and CI dashboards.
5.  **Programmatic API**:
    *   Can be imported and run dynamically in Node.js scripts.

---

## Installation

Install as a devDependency using your package manager:

```bash
pnpm add -D i18n-sharpen
# or
npm install -D i18n-sharpen
# or
yarn add -D i18n-sharpen
```

---

## Configuration

Create an `i18n-sharpen.json` file in the root of your project:

```json
{
  "scanDirs": ["src", "packages/shared/src"],
  "localesDir": "src/locales",
  "defaultLanguage": "en",
  "supportedLanguages": ["en", "ja", "vi"],
  "matchFunctions": ["t", "getTranslation"],
  "outputReport": "i18n-coverage.md"
}
```

Alternatively, you can add an `"i18nSharpen"` field to your `package.json`:

```json
{
  "name": "my-app",
  "i18nSharpen": {
    "scanDirs": ["src"],
    "localesDir": "src/locales",
    "defaultLanguage": "en",
    "supportedLanguages": ["en", "ja"]
  }
}
```

### Config Options

| Option | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `scanDirs` | `string[]` | `["src"]` | Folders to scan for translation keys. |
| `localesDir` | `string` | `"src/locales"` | Directory containing your locale `.json` files. |
| `defaultLanguage` | `string` | `"en"` | The default/fallback locale language. |
| `supportedLanguages` | `string[]` | `["en"]` | List of supported languages. |
| `excludeDirs` | `string[]` | `["node_modules", "dist", ...]` | Directories to ignore during source scan. |
| `fileExtensions` | `string[]` | `[".ts", ".tsx", ".js", ".jsx"]` | File extensions to scan. |
| `matchFunctions` | `string[]` | `["t", "getTranslation"]` | Function names used for translation in code. |
| `outputReport` | `string \| null` | `"i18n-coverage.md"` | Path to save quality report (null to disable). |

---

## CLI Usage

Run commands with `npx` or configure scripts in `package.json`:

```bash
# Validate translation keys and alignment
npx i18n-sharpen validate

# Extract new keys from code into json files
npx i18n-sharpen extract

# Prune unused keys from json files
npx i18n-sharpen prune
```

### Options

*   `-c, --config <path>`: Specify a custom path to your configuration file.
*   `-d, --cwd <path>`: Set custom working directory (defaults to `process.cwd()`).

```bash
npx i18n-sharpen validate --config configs/i18n.json --cwd ./packages/app
```

---

## Programmatic API

You can import `i18n-sharpen` to run tasks programmatically:

```typescript
import { loadConfig, validate, extract, prune } from "i18n-sharpen"

// Load and validate configuration
const config = loadConfig(process.cwd())

// Run validation
const results = validate(config, process.cwd())
console.log(`Coverage: ${results.codeKeyCoverage}%`)

// Run extractor
extract(config, process.cwd())

// Run pruner
prune(config, process.cwd())
```

---

## License

MIT
