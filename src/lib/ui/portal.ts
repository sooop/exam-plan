// 요소를 body 로 옮긴다. 층·토스트·툴팁은 앱 본체(#app) 밖에 두어야 #app 에 걸리는 inert 에 막히지 않는다.
export function portal(node: HTMLElement, target: HTMLElement | null = null) {
  (target ?? document.body).appendChild(node);
  return {
    destroy() {
      node.remove();
    },
  };
}
