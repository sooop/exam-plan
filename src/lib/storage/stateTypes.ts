// 로컬 저장소가 알아야 하는 상태의 최소 모양. core 의 State 타입에 의존하지 않는다.
// 저장소는 내용을 해석하지 않고, 버전(v)과 마지막 수정 시각(updatedAt, 밀리초)만 본다.
export interface StateLike {
  v: number;
  updatedAt: number;
}
