import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { app } from './lib/app/app.svelte';
import { history } from './lib/history/history.svelte';
import { applyStoredAnim, applyStoredTheme } from './lib/dialogs/appearance';

// 첫 화면이 그려지기 전에 테마와 화면 움직임 설정을 반영한다
applyStoredTheme();
applyStoredAnim();

mount(App, { target: document.getElementById('app')! });
// 변경 이력은 동기화가 시작되기 전에 연결해야 '동기화 직전' 스냅샷이 걸린다
void history.connect(app);
// 저장본을 읽는 동안 셸은 로딩 표시를 보인다
void app.init();
