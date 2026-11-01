import { readFile, readdir, rm } from 'node:fs/promises';
import { defineConfig } from 'astro/config';

// Images of works not marked public must not be reachable by guessing their URL.
const hidePrivateImages = {
  name: 'hide-private-images',
  hooks: {
    'astro:build:done': async ({ dir }) => {
      const folder = new URL('./src/content/works/', import.meta.url);
      const keep = new Set(), drop = new Set();
      for (const file of await readdir(folder)) {
        const text = await readFile(new URL(file, folder), 'utf8');
        const target = /^public:\s*true\s*$/m.test(text) ? keep : drop;
        for (const [ref] of text.matchAll(/\/works\/[^\s,\]"']+\.\w+/g)) target.add(ref);
      }
      for (const ref of drop) {
        if (!keep.has(ref)) await rm(new URL(`.${ref}`, dir), { force: true });
      }
    },
  },
};

export default defineConfig({ devToolbar: { enabled: false }, integrations: [hidePrivateImages] });
