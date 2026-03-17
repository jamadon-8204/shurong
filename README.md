# shurong

아이폰 Safari에서 바로 열 수 있고 홈 화면에 추가할 수 있는 정적 중국어 단어 암기 앱입니다. Anki에서 가져온 감각을 유지하되, 하루 새 단어 수를 기본 10개로 두고 부담 없이 이어가도록 만들었습니다.

## 포함된 기능

- 하루 새 카드 기본값 `10`
- 난이도 버튼 기반 반복 학습
- 오늘 새 카드, 복습 카드, 연속 학습 일수 표시
- `localStorage` 기반 진행도 저장
- Service Worker 기반 오프라인 캐시
- 사용자 단어 직접 추가

## 실행

정적 파일만 있으면 됩니다.

1. 로컬에서 간단히 확인할 때
   - `python -m http.server 4173`
2. 브라우저에서 열기
   - `http://127.0.0.1:4173`
3. 아이폰에서 쓰기
   - GitHub Pages, Netlify, Vercel 같은 정적 호스팅에 올린 뒤 Safari로 접속
   - 공유 버튼 -> `홈 화면에 추가`

## GitHub + Render 배포

이 프로젝트는 `render.yaml` 이 포함되어 있어서 GitHub에 올린 뒤 Render에서 바로 Static Site로 연결할 수 있습니다.

1. Git 저장소 초기화
   - `git init -b main`
2. 첫 커밋
   - `git add .`
   - `git commit -m "Initial shurong app"`
3. GitHub 저장소 생성 후 연결
   - `git remote add origin https://github.com/<YOUR_NAME>/<YOUR_REPO>.git`
   - `git push -u origin main`
4. Render Dashboard에서 `New +` -> `Blueprint` 선택
5. 방금 만든 GitHub 저장소를 고르면 Render가 루트의 `render.yaml`을 읽어 Static Site를 생성
6. 배포 완료 후 발급된 URL을 아이폰 Safari에서 열고 `홈 화면에 추가`

이 앱은 백엔드가 없는 정적 PWA라서 Render에서는 별도 데이터베이스나 환경 변수 없이 배포할 수 있습니다.

## 사용자 단어 형식

텍스트 영역에 아래 형식으로 한 줄씩 추가하면 됩니다.

```text
朋友|péngyou|친구|사람
机场|jīchǎng|공항|장소
```

`한자|병음|뜻` 까지는 필수이고, 카테고리는 선택입니다.

