# Corpus Sources

This directory contains real-world OSS files used for the differential shadow test (regex vs. AST parity) and the performance baseline benchmark.

> **Note**: These files are **parsed**, not executed. They are strictly excluded from the `tsup` build graph and `vitest` unit tests.

## Sources

### JS/TS (React)
- **Repo**: https://github.com/nelsonlaidev/nelsonlai.dev
- **Commit**: `76f67d7f29716d185b4f43f3aa7c0cde57d64873`
- **License**: MIT
- **Files**:
  - `src/app/[locale]/(main)/about/page.tsx` → `js-ts/about.page.tsx`
  - `src/app/[locale]/(main)/blog/page.tsx` → `js-ts/blog.page.tsx`
  - `src/app/[locale]/(main)/dashboard/page.tsx` → `js-ts/home.page.tsx`
- **Extraction Mechanism**: Plain `t("key")` call inside React components.

### Vue
- **Repo**: https://github.com/vuesion/vuesion
- **Commit**: `b6683b566600bc55494d854e7d08e01248df4d05`
- **License**: MIT
- **Files**:
  - `src/pages/index.vue` → `vue/index.vue`
  - `src/pages/services/index.vue` → `vue/services-index.vue`
- **Extraction Mechanism**: `<script setup>` with `const { t } = useI18n()` and plain `t("key")` in templates.

### Svelte
- **Repo**: https://github.com/Scorpio3310/sveltekit-i18n-starter
- **Commit**: `20d7b9b2631f7be3a8b694dced2208df9c89d5f6`
- **License**: MIT
- **Files**:
  - `src/components/Footer.svelte` → `svelte/Footer.svelte`
  - `src/components/Navbar.svelte` → `svelte/Navbar.svelte`
  - `src/routes/[lang=lang]/+page.svelte` → `svelte/home-page.svelte`
- **Extraction Mechanism**: Plain `t("key")` call in template markup.

### Astro
- **Repo**: https://github.com/Scorpio3310/astro-i18n-starter
- **Commit**: `f591db710affde9c260c5abe52fa1e3262da82e0`
- **License**: MIT
- **Files**:
  - `src/components/Header.astro` → `astro/Header.astro`
  - `src/components/Footer.astro` → `astro/Footer.astro`
  - `src/components/Info.astro` → `astro/Info.astro`
- **Extraction Mechanism**: Plain `t("key")` call in Astro components.
