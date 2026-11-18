/// <reference types="vitest/config" />
import { existsSync, readFileSync, renameSync } from 'node:fs';
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

// 아이콘 링크 주입. single 은 파일이 하나뿐이라 PNG 를 data URI 로 내장하고, 그 외에는 public/icons 를 상대 경로로 가리킨다.
function appIcons(single: boolean, base: string): Plugin {
  const dataUri = (rel: string) => `data:image/png;base64,${readFileSync(resolve(import.meta.dirname, 'public/icons', rel)).toString('base64')}`;
  const url = (rel: string) => (single ? dataUri(rel) : `${base}icons/${rel}`);
  return {
    name: 'app-icons',
    transformIndexHtml() {
      const tags: { tag: string; attrs: Record<string, string>; injectTo: 'head' }[] = [
        { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: url('favicon/favicon-32x32.png') }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', sizes: '180x180', href: url('apple/apple-touch-icon.png') }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: '공부 플래너' }, injectTo: 'head' },
        { tag: 'meta', attrs: { name: 'theme-color', content: '#d97757' }, injectTo: 'head' },
      ];
      if (!single) tags.push({ tag: 'link', attrs: { rel: 'manifest', href: `${base}manifest.webmanifest` }, injectTo: 'head' });
      return tags;
    },
  };
}

export default defineConfig(({ mode }) => {
  const single = mode === 'single';
  const stat = mode === 'static';
  return {
    base: single || stat ? './' : '/',
    plugins: [svelte(), appIcons(single, single || stat ? './' : '/'), ...(single ? [viteSingleFile(), renameSingle()] : [])],
    define: { __TARGET__: JSON.stringify(single ? 'single' : stat ? 'static' : 'dev') },
    publicDir: single ? false : 'public',
    build: {
      outDir: single ? 'dist-single' : 'dist-static',
      emptyOutDir: true,
      target: 'es2022',
    },
    test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
  };
});
