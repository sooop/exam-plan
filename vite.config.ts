/// <reference types="vitest/config" />
import { existsSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

// mode: 'static' → 여러 파일의 정적 사이트(dist-static, 상대 경로), 'single' → 파일 1개(dist-single/exam-plan.html), 그 외 → 개발
const SINGLE_FILE = 'exam-plan.html';

function renameSingle(): Plugin {
  let out = '';
  return {
    name: 'rename-single',
    apply: 'build',
    enforce: 'post',
    configResolved(cfg) { out = resolve(cfg.root, cfg.build.outDir); },
    closeBundle() {
      const from = resolve(out, 'index.html');
      if (existsSync(from)) renameSync(from, resolve(out, SINGLE_FILE));
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const stat = mode === 'static';
  return {
    base: single || stat ? './' : '/',
    plugins: [svelte(), ...(single ? [viteSingleFile(), renameSingle()] : [])],
    define: { __TARGET__: JSON.stringify(single ? 'single' : stat ? 'static' : 'dev') },
    build: {
      outDir: single ? 'dist-single' : 'dist-static',
      emptyOutDir: true,
      target: 'es2022',
    },
    test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
  };
});
