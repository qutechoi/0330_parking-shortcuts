# iPhone 단축어 연동 주차 시간 기록기

기존 주차 시간 계산기를 iPhone 단축어와 연동할 수 있도록 확장한 버전입니다. URL 파라미터만으로 자동 입차/출차를 처리할 수 있어, 위치 자동화와 연결하기 좋습니다.

## 핵심 기능

- 입차 버튼 / 출차 버튼 상태 제어
- 월 90시간 기준 사용량 계산
- 수동 시간 입력
- 기록 수정 / 삭제
- CSV 내보내기
- localStorage 저장
- GitHub Pages 자동 배포
- **URL 기반 자동 입차/출차 처리**

## 단축어용 URL

배포 후 아래 형식으로 사용할 수 있습니다.

- 입차: `https://qutechoi.github.io/0330_parking-shortcuts/?action=entry`
- 출차: `https://qutechoi.github.io/0330_parking-shortcuts/?action=exit`

이 URL을 iPhone 단축어의 위치 자동화(도착 / 떠남)에서 열면 됩니다.

## 자동 기록 동작

- `action=entry`
  - 현재 입차 상태가 아니면 자동으로 입차 기록
  - 이미 입차 상태면 중복 기록하지 않음
- `action=exit`
  - 현재 입차 상태면 자동으로 출차 처리 후 기록 저장
  - 입차 상태가 아니면 안내 메시지만 표시

같은 분 안에 동일 액션이 중복 호출되면 중복 처리 방지 로직이 작동합니다.

## 개발 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
npm run preview
```

## GitHub Pages 자동 배포

이 저장소에는 GitHub Actions 기반 자동 배포 워크플로가 포함되어 있습니다.

1. **Settings → Pages**
2. **Source = GitHub Actions** 선택
3. `main` 브랜치에 push 하면 자동 배포

## 기술 스택

- React
- Vite
- localStorage
- GitHub Actions
- GitHub Pages
