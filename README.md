# 샘물 — 워십 피아노 반주

코드 진행·템포·분위기를 고르면 브라우저 안에서 피아노 반주를 만들어 미리 듣고 WAV로 저장하는 정적 웹 앱입니다. 서버·로그인·저장 기능은 없습니다.

바로 쓰기: https://suenaeunyang.github.io/worship-piano-accompaniment/

## 다른 컴퓨터에서 작업하기

```bash
git clone https://github.com/SueNaEunYang/worship-piano-accompaniment.git
cd worship-piano-accompaniment
```

로컬에서 열 때는 `index.html`을 더블클릭하지 말고 간단한 웹 서버로 여세요 (파일로 열면 피아노 샘플을 못 불러와 대체 음색으로 재생됩니다). 아래 중 설치된 것 하나면 됩니다.

```bash
python -m http.server 8000
```

```bash
npx serve .
```

그다음 http://localhost:8000 을 엽니다. 고친 뒤 `git add -A`, `git commit`, `git push` 하면 GitHub Pages에 1~2분 뒤 반영됩니다.

## 구조

- `index.html`, `styles.css` — 화면
- `app.js` — 코드 해석, 화음 연결(보이스 리딩), 분위기별 반주 패턴, 렌더링, WAV 저장
- `samples/` — Salamander Grand Piano 샘플 29개 (C1–C8, 단3도 간격)

## 음원 저작권

피아노 음원: Salamander Grand Piano — Alexander Holm, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). Tone.js 배포본(tonejs.github.io/audio/salamander)에서 가져왔습니다.
