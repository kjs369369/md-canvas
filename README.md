# MD Canvas

Markdown 파일을 브라우저에서 읽고 미리보기한 뒤 PDF, HTML, DOCX 형식으로 내보내는 GUI 웹앱 프로젝트입니다.

## 현재 상태

- Apple 스타일·골드 포인트 랜딩 페이지
- Markdown 파일 로컬 읽기와 미리보기
- PDF·HTML·Word 파일 다운로드와 브라우저 미리보기
- 서버에 파일을 저장하지 않는 공유 보기 주소 (`view.html#...`)
- 개인정보처리방침·이용약관·오픈소스 라이선스
- OG·Twitter 카드와 검색엔진 메타데이터

## 로컬 실행

```bash
npm install
npm test
npm run build
cd prototype
python3 -m http.server 4173
```

## 보안 원칙

- 기본 모드에서 문서 원문을 서버에 저장하지 않습니다.
- 파일 확장자와 최대 용량을 검사합니다.
- 사용자 문서는 HTML 이스케이프 후 제한된 Markdown 문법만 렌더링합니다.
- Vercel 보안 헤더와 CSP를 설정합니다.
