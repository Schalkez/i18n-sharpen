# Plan 05-01 Summary

## Completed Tasks
- **Task 1**: Added `scratch/` to `.gitignore`. Installed `tsx` as a devDependency. Created `tsconfig.scripts.json` preserving the `@/` alias. Updated `typecheck` in `package.json` to include scripts typechecking.
- **Task 2**: Vendored one real OSS project per framework (JS/TS, Vue, Svelte, Astro) into `tests/corpus/`. Pinned actual SHAs and authored `tests/corpus/SOURCES.md` provenance manifest ensuring correct constraints.

## Artifacts Created
- `tests/corpus/SOURCES.md`
- `tests/corpus/js-ts/about.page.tsx`, `blog.page.tsx`, `home.page.tsx`
- `tests/corpus/vue/index.vue`, `services-index.vue`
- `tests/corpus/svelte/Footer.svelte`, `Navbar.svelte`, `home-page.svelte`
- `tests/corpus/astro/Header.astro`, `Footer.astro`, `Info.astro`
- `tsconfig.scripts.json`

## Status
Ready for Plan 05-02.
