---
name: Bug report
about: Something isn't working correctly
title: '[Bug] '
labels: bug
assignees: ''
---

## Description

A clear description of the bug.

## Version

```
npx i18n-sharpen --version
```

## Framework / File type

<!-- e.g. Vue 3, Svelte 5, Astro 4, React/TSX -->

## Config (`i18n-sharpen.json`)

```json
{
  "scanDirs": ["src"],
  "localesDir": "src/locales",
  "defaultLanguage": "en",
  "supportedLanguages": ["en"]
}
```

## Minimal reproduction

<!-- Smallest source file + locale file that triggers the bug -->

**Source file:**
```tsx
// src/Component.tsx
t("some.key")
```

**Locale file:**
```json
{ "some.key": "value" }
```

## Expected behavior

What should happen.

## Actual behavior

What actually happens. Include the full CLI output or error message.

## Additional context

Node.js version, OS, package manager.
