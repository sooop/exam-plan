// 견본 전용 진입점(앱의 main.ts 와 별개). src/lib/ui/gallery.html 이 불러온다.
import { mount } from 'svelte';
import '../../app.css';
import Gallery from './Gallery.svelte';

mount(Gallery, { target: document.getElementById('app')! });
