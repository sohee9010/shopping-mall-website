# 상품 이미지 제작 가이드 (D-4)

ÉTAGE 상품 이미지를 **AI로 직접 제작**해 톤을 통일하기 위한 작업 기준서다.

## 왜 바꾸나

- 지금 상품 사진은 Unsplash에서 고른 **인물·배경·조명이 제각각인 사진**이라, 목록에 모이면 통일감이 없고 상품이 눈에 들어오지 않는다.
- 같은 상품의 **색상별 사진이 없어** 컬러 스와치를 눌러도 이미지를 바꿀 수 없다(바꾸면 고른 색과 다른 사진이 나온다).
- 메인 화보(히어로·룩북·기획)는 지금 Unsplash 사진을 그대로 쓴다. **상품 이미지만** 교체한다.

## 원칙

| 항목 | 기준 |
|---|---|
| 분위기 | 이솝·탬버린즈처럼 차분한 톤(돌, 자연광, 낮은 채도). **분위기만 참고하고 실존 브랜드의 패키지 모양·로고·병 디자인은 따라 하지 않는다** |
| 글자·로고 | 이미지 안에 **글자·로고·라벨 문구 금지** (가상 브랜드 원칙). 라벨은 빈 라벨로 |
| 배경 | 의류·잡화: 이음매 없는 따뜻한 밝은 회색 단색 / 뷰티: 트래버틴 돌 + 베이지 회벽 |
| 구도 | 세로 3:4, 상품 가운데, 위아래 여백 충분히 (카드가 3:4 비율로 잘라서 보여 준다) |
| 크기 | 1200×1600 이상, PNG 또는 JPG |
| 색상별 이미지 | 같은 상품은 **각도·조명·배경·구도를 똑같이** 하고 색만 바꾼다 (아래 '색만 바꾸기') |
| 표기 | 출처 페이지에 'AI 생성 이미지(가상 상품)'로 밝힌다. 비상업 포트폴리오 용도 |

## 공통 스타일 문구

프롬프트 맨 앞에 품목 묘사를 넣고, 뒤에 스타일 문구를 그대로 붙인다.

**A. 의류** (ghost mannequin: 사람 없이 옷이 입혀진 듯한 형태)

```
{품목 묘사} in {색}, shown on an invisible ghost mannequin, front view, centered, the whole garment visible with generous margin above and below, seamless plain warm light gray studio background (#ECE9E4), soft diffused overhead light, subtle natural shadow beneath, no model, no face, no hands, no text, no logo, no label, no tag, photorealistic, detailed fabric texture, vertical 3:4
```

**B. 가방·신발·주얼리·시계**

```
{품목 묘사} in {색}, studio still life, three-quarter view, centered on a seamless plain warm light gray background (#ECE9E4), soft diffused light, gentle contact shadow, generous margin around the object, no text, no logo, no engraving, no brand marks, photorealistic, vertical 3:4
```

**C. 뷰티**

```
{품목 묘사}{, 색이 있으면 "in the shade {색}"}, placed on a raw travertine stone block, warm beige plaster wall behind, soft natural window light from the left with gentle shadows, calm minimal composition, unbranded minimal packaging with a completely blank label, no text, no logo, editorial product photography, photorealistic, vertical 3:4
```

## 색만 바꾸기 (같은 상품의 두 번째 색)

첫 번째 색 이미지를 만든 **같은 대화창에서** 이어서 요청한다.

```
Recreate exactly the same image — same item shape, same angle, same lighting, same background and framing — and change only the color of the item to {색}. Keep everything else identical.
```

두 장을 나란히 놓고 **모양·각도·배경 밝기가 같은지** 확인한다. 다르면 다시 요청한다.

## 확인 목록 (한 장마다)

- [ ] 글자·로고·라벨 문구가 없다 (병 라벨, 옷 안쪽 태그, 시계 숫자판까지 확인)
- [ ] 사람 손·얼굴이 없다 (의류)
- [ ] 배경이 단색이고 다른 이미지와 밝기가 비슷하다
- [ ] 상품이 가운데 있고 위아래가 잘리지 않았다
- [ ] 색이 표의 색과 맞다 (차콜인데 검정처럼 보이지 않는지 등)
- [ ] 이상한 부분이 없다 (단추가 녹아 있음, 끈이 끊김, 손가락 같은 형태)

## 전달 방법

1. 바탕 화면에 `etage-images` 폴더를 만들고, 아래 표의 **파일 이름 그대로** 저장한다 (예: `6-charcoal.png`).
2. 저장소 안에는 넣지 않는다 (원본은 크다). 받으면 웹용(webp, 크기별)으로 변환해 반영한다.
3. 먼저 **시범 9개(16장)** 만 만든다 → 화면에서 확인 → 기준을 다듬은 뒤 나머지를 만든다.

## 시범 9개 — 바로 붙여 넣는 프롬프트

시범 상품: 니트·코트·남성 재킷(의류 3), 숄더백·로퍼·네크리스(잡화 3), 토너·세럼·립스틱(뷰티 3). 토너(46)는 지금 사진에 실존 브랜드 로고·문구가 보여 가장 먼저 교체한다. 색상별 이미지가 있는 상품 위주로 골라 스와치 동작까지 확인한다.

**6-charcoal.png** — LUNELLE 캐시미어 라운드넥 니트
```
Women's fine cashmere crew-neck sweater in charcoal gray, shown on an invisible ghost mannequin, front view, centered, the whole garment visible with generous margin above and below, seamless plain warm light gray studio background (#ECE9E4), soft diffused overhead light, subtle natural shadow beneath, no model, no face, no hands, no text, no logo, no label, no tag, photorealistic, detailed fabric texture, vertical 3:4
```
**6-camel.png** → 위 이미지 다음에 '색만 바꾸기' 문구, 색: `camel brown`

**2-charcoal.png** — LUNELLE 울 캐시미어 더블 코트
```
Women's double-breasted wool cashmere long coat with notch lapels in charcoal gray, shown on an invisible ghost mannequin, front view, centered, the whole garment visible with generous margin above and below, seamless plain warm light gray studio background (#ECE9E4), soft diffused overhead light, subtle natural shadow beneath, no model, no face, no hands, no text, no logo, no label, no tag, photorealistic, detailed fabric texture, vertical 3:4
```
**2-camel.png** → '색만 바꾸기', 색: `camel brown`

**22-charcoal.png** — GREYMONT 울 블레이저
```
Men's two-button wool blazer in charcoal gray, shown on an invisible ghost mannequin, front view, centered, the whole garment visible with generous margin above and below, seamless plain warm light gray studio background (#ECE9E4), soft diffused overhead light, subtle natural shadow beneath, no model, no face, no hands, no text, no logo, no label, no tag, photorealistic, detailed fabric texture, vertical 3:4
```
**22-camel.png** → '색만 바꾸기', 색: `camel brown`

**34-charcoal.png** — ATELIER VERO 레더 호보 숄더백
```
Soft leather hobo shoulder bag in charcoal gray, studio still life, three-quarter view, centered on a seamless plain warm light gray background (#ECE9E4), soft diffused light, gentle contact shadow, generous margin around the object, no text, no logo, no engraving, no brand marks, photorealistic, vertical 3:4
```
**34-camel.png** → '색만 바꾸기', 색: `camel brown`

**40-default.png** — ATELIER VERO 페니 로퍼 (색상 옵션 없음)
```
A pair of brown leather penny loafers, studio still life, three-quarter view, centered on a seamless plain warm light gray background (#ECE9E4), soft diffused light, gentle contact shadow, generous margin around the object, no text, no logo, no engraving, no brand marks, photorealistic, vertical 3:4
```

**42-yellowgold.png** — ORBE 14K 체인 네크리스
```
Fine delicate 14k chain necklace in 14k yellow gold, laid in a soft curve, studio still life, top-down view, centered on a seamless plain warm light gray background (#ECE9E4), soft diffused light, gentle contact shadow, generous margin around the object, no text, no logo, no engraving, no brand marks, photorealistic, vertical 3:4
```
**42-whitegold.png** → '색만 바꾸기', 색: `14k white gold`

**46-default.png** — DEWLAB 약산성 밸런싱 토너 (지금 사진에 실존 브랜드 로고가 보여 우선 교체)
```
Frosted glass toner bottle 200ml with a completely blank label, placed on a raw travertine stone block, warm beige plaster wall behind, soft natural window light from the left with gentle shadows, calm minimal composition, unbranded minimal packaging, no text, no logo, editorial product photography, photorealistic, vertical 3:4
```

**48-default.png** — DEWLAB 비타민C 브라이트닝 세럼
```
Clear glass dropper serum bottle 30ml with a completely blank label, placed on a raw travertine stone block, warm beige plaster wall behind, soft natural window light from the left with gentle shadows, calm minimal composition, unbranded minimal packaging, no text, no logo, editorial product photography, photorealistic, vertical 3:4
```

**52-01-rosy.png** — NOCTURNE 벨벳 매트 립스틱
```
Matte lipstick in a minimal black metal case with the cap off and the bullet visible, in the shade muted rosy pink, placed on a raw travertine stone block, warm beige plaster wall behind, soft natural window light from the left with gentle shadows, calm minimal composition, unbranded minimal packaging, no text, no logo, editorial product photography, photorealistic, vertical 3:4
```
**52-02-coral.png**, **52-03-brick.png** → '색만 바꾸기' (립스틱 색만), 색: `soft coral`, `deep brick red`

## 전체 체크리스트 (56개 상품, 99장)

- ★ = 시범. '스타일'은 위 공통 문구 A·B·C 중 어느 것을 붙일지
- 색이 '—'인 상품은 색상 옵션이 없어 1장 (`{id}-default.png`)
- 신발은 사이즈만 옵션이라 1장. 향수 50ml·100ml는 같은 병이라 1장
- 파운데이션(54)은 케이스가 같으니 1장만 만들고 '색만 바꾸기'로 쿠션 색만 바꾼다

| 시범 | id | 상품 | 스타일 | 품목(영문) | 색(영문) | 파일 이름 |
|---|---|---|---|---|---|---|
| ★ | 2 | LUNELLE 울 캐시미어 더블 코트 | A 의류 | women's double-breasted wool cashmere long coat with notch lapels | charcoal gray / camel brown | 2-charcoal.png<br>2-camel.png |
|  | 3 | LUNELLE 핸드메이드 울 하프 코트 | A 의류 | women's handmade wool half-length coat, relaxed shawl collar | heather gray / warm cream | 3-gray.png<br>3-cream.png |
|  | 4 | LUNELLE 크롭 트위드 재킷 | A 의류 | women's cropped boucle tweed jacket, collarless, fringed edges | black / ivory | 4-black.png<br>4-ivory.png |
|  | 5 | LUNELLE 테일러드 울 재킷 | A 의류 | women's single-breasted tailored wool blazer | deep navy / sand beige | 5-navy.png<br>5-beige.png |
| ★ | 6 | LUNELLE 캐시미어 라운드넥 니트 | A 의류 | women's fine cashmere crew-neck sweater | charcoal gray / camel brown | 6-charcoal.png<br>6-camel.png |
|  | 7 | LUNELLE 케이블 니트 카디건 | A 의류 | women's chunky cable-knit button cardigan | heather gray / warm cream | 7-gray.png<br>7-cream.png |
|  | 8 | SABLE & CO. 실크 리본 블라우스 | A 의류 | women's silk blouse with a soft neck bow tie | black / ivory | 8-black.png<br>8-ivory.png |
|  | 9 | SABLE & CO. 코튼 핀턱 블라우스 | A 의류 | women's cotton pintuck blouse with long sleeves | deep navy / sand beige | 9-navy.png<br>9-beige.png |
|  | 10 | SABLE & CO. 슬림핏 베이직 티셔츠 | A 의류 | women's slim-fit plain crew-neck t-shirt | charcoal gray / camel brown | 10-charcoal.png<br>10-camel.png |
|  | 11 | SABLE & CO. 보트넥 스트라이프 티셔츠 | A 의류 | women's boat-neck breton stripe long-sleeve t-shirt (stripe color as given, white base) | heather gray / warm cream | 11-gray.png<br>11-cream.png |
|  | 12 | SABLE & CO. 플리츠 미디 원피스 | A 의류 | women's pleated midi dress with short sleeves | black / ivory | 12-black.png<br>12-ivory.png |
|  | 13 | SABLE & CO. 랩 미디 원피스 | A 의류 | women's wrap midi dress with tie waist | deep navy / sand beige | 13-navy.png<br>13-beige.png |
|  | 14 | SABLE & CO. 니트 롱 원피스 | A 의류 | women's long knit dress, ribbed, long sleeves | charcoal gray / camel brown | 14-charcoal.png<br>14-camel.png |
|  | 15 | SABLE & CO. 셔링 롱 원피스 | A 의류 | women's shirred long dress with puff sleeves | heather gray / warm cream | 15-gray.png<br>15-cream.png |
|  | 16 | LUNELLE 울 와이드 팬츠 | A 의류 | women's high-waist wool wide-leg trousers | black / ivory | 16-black.png<br>16-ivory.png |
|  | 17 | LUNELLE 세미 부츠컷 슬랙스 | A 의류 | women's semi-bootcut slacks with pressed crease | deep navy / sand beige | 17-navy.png<br>17-beige.png |
|  | 18 | SABLE & CO. 울 플리츠 스커트 | A 의류 | women's wool pleated midi skirt | charcoal gray / camel brown | 18-charcoal.png<br>18-camel.png |
|  | 19 | SABLE & CO. 새틴 미디 스커트 | A 의류 | women's satin bias-cut midi skirt | heather gray / warm cream | 19-gray.png<br>19-cream.png |
|  | 20 | GREYMONT 싱글 브레스티드 울 코트 | A 의류 | men's single-breasted wool overcoat | black / ivory | 20-black.png<br>20-ivory.png |
|  | 21 | GREYMONT 발마칸 코트 | A 의류 | men's balmacaan raglan-sleeve coat | deep navy / sand beige | 21-navy.png<br>21-beige.png |
| ★ | 22 | GREYMONT 울 블레이저 | A 의류 | men's two-button wool blazer | charcoal gray / camel brown | 22-charcoal.png<br>22-camel.png |
|  | 23 | GREYMONT 코듀로이 재킷 | A 의류 | men's corduroy chore jacket | heather gray / warm cream | 23-gray.png<br>23-cream.png |
|  | 24 | GREYMONT 옥스퍼드 버튼다운 셔츠 | A 의류 | men's oxford button-down shirt | black / ivory | 24-black.png<br>24-ivory.png |
|  | 25 | GREYMONT 린넨 레귤러 셔츠 | A 의류 | men's linen regular-fit shirt | deep navy / sand beige | 25-navy.png<br>25-beige.png |
|  | 26 | OFFBEAT STUDIO 램스울 크루넥 니트 | A 의류 | men's lambswool crew-neck sweater | charcoal gray / camel brown | 26-charcoal.png<br>26-camel.png |
|  | 27 | OFFBEAT STUDIO 하프집업 니트 | A 의류 | men's half-zip knit sweater | heather gray / warm cream | 27-gray.png<br>27-cream.png |
|  | 28 | OFFBEAT STUDIO 헤비웨이트 티셔츠 | A 의류 | men's heavyweight plain t-shirt | black / ivory | 28-black.png<br>28-ivory.png |
|  | 29 | OFFBEAT STUDIO 오버핏 롱슬리브 | A 의류 | men's oversized long-sleeve t-shirt | deep navy / sand beige | 29-navy.png<br>29-beige.png |
|  | 30 | GREYMONT 울 테이퍼드 슬랙스 | A 의류 | men's wool tapered trousers | charcoal gray / camel brown | 30-charcoal.png<br>30-camel.png |
|  | 31 | GREYMONT 원턱 와이드 슬랙스 | A 의류 | men's one-pleat wide trousers | heather gray / warm cream | 31-gray.png<br>31-cream.png |
|  | 32 | OFFBEAT STUDIO 셀비지 스트레이트 데님 | A 의류 | men's selvedge straight-leg jeans (dyed in the given color) | black / ivory | 32-black.png<br>32-ivory.png |
|  | 33 | OFFBEAT STUDIO 와이드 워시드 데님 | A 의류 | men's wide washed jeans (dyed in the given color) | deep navy / sand beige | 33-navy.png<br>33-beige.png |
| ★ | 34 | ATELIER VERO 레더 호보 숄더백 | B 잡화 | soft leather hobo shoulder bag | charcoal gray / camel brown | 34-charcoal.png<br>34-camel.png |
|  | 35 | ATELIER VERO 미니 크로스 숄더백 | B 잡화 | mini leather crossbody bag with thin strap | heather gray / warm cream | 35-gray.png<br>35-cream.png |
|  | 36 | ATELIER VERO 소프트 레더 토트백 | B 잡화 | soft leather tote bag | black / ivory | 36-black.png<br>36-ivory.png |
|  | 37 | ATELIER VERO 캔버스 데이 토트백 | B 잡화 | canvas day tote bag with leather handles | deep navy / sand beige | 37-navy.png<br>37-beige.png |
|  | 38 | ATELIER VERO 레더 코트 스니커즈 | B 잡화 | white leather court sneakers, minimal | — | 38-default.png |
|  | 39 | ATELIER VERO 스웨이드 러너 | B 잡화 | suede running sneakers, taupe | — | 39-default.png |
| ★ | 40 | ATELIER VERO 페니 로퍼 | B 잡화 | brown leather penny loafers | — | 40-default.png |
|  | 41 | ATELIER VERO 체인 홀스빗 로퍼 | B 잡화 | black leather loafers with a plain metal bar detail | — | 41-default.png |
| ★ | 42 | ORBE 14K 체인 네크리스 | B 잡화 | fine 14k chain necklace, delicate | 14k yellow gold / 14k white gold | 42-yellowgold.png<br>42-whitegold.png |
|  | 43 | ORBE 진주 드롭 이어링 | B 잡화 | pearl drop earrings on a 14k hook | 14k yellow gold / 14k white gold | 43-yellowgold.png<br>43-whitegold.png |
|  | 44 | ORBE 클래식 레더 스트랩 워치 | B 잡화 | minimal wristwatch with a brown leather strap, plain white dial without text | — | 44-default.png |
|  | 45 | ORBE 미니멀 메탈 브레이슬릿 워치 | B 잡화 | minimal wristwatch with a slim metal bracelet, plain dial without text | — | 45-default.png |
| ★ | 46 | DEWLAB 약산성 밸런싱 토너 200ml | C 뷰티 | frosted glass toner bottle 200ml with blank label | — | 46-default.png |
|  | 47 | DEWLAB 히알루론 수분 토너 200ml | C 뷰티 | clear glass toner bottle 200ml with blank label | — | 47-default.png |
| ★ | 48 | DEWLAB 비타민C 브라이트닝 세럼 30ml | C 뷰티 | clear glass dropper serum bottle 30ml with blank label | — | 48-default.png |
|  | 49 | DEWLAB 펩타이드 리페어 세럼 30ml | C 뷰티 | frosted glass dropper serum bottle 30ml with blank label | — | 49-default.png |
|  | 50 | DEWLAB 세라마이드 장벽 크림 50ml | C 뷰티 | matte ceramic cream jar 50ml with blank lid | — | 50-default.png |
|  | 51 | DEWLAB 나이트 리커버리 크림 50ml | C 뷰티 | dark matte cream jar 50ml with blank lid | — | 51-default.png |
| ★ | 52 | NOCTURNE 벨벳 매트 립스틱 | C 뷰티 | matte lipstick in a minimal black metal case, bullet visible, color as given | muted rosy pink / soft coral / deep brick red | 52-01-rosy.png<br>52-02-coral.png<br>52-03-brick.png |
|  | 53 | NOCTURNE 글로우 틴트 밤 | C 뷰티 | tinted lip balm in a minimal tube, color as given | muted rosy pink / soft coral / deep brick red | 53-01-rosy.png<br>53-02-coral.png<br>53-03-brick.png |
|  | 54 | NOCTURNE 롱웨어 쿠션 파운데이션 | C 뷰티 | cushion foundation compact, open, showing the shade as given | light beige shade 21 / natural beige shade 23 | 54-21.png<br>54-23.png |
|  | 55 | NOCTURNE 블러 프라이머 | C 뷰티 | blur primer in a minimal squeeze tube with blank label | — | 55-default.png |
|  | 56 | NOCTURNE 미드나잇 우드 오 드 퍼퓸 | C 뷰티 | eau de parfum glass bottle with heavy square cap, dark woody liquid, blank label | — | 56-default.png |
|  | 57 | NOCTURNE 화이트 머스크 오 드 퍼퓸 | C 뷰티 | eau de parfum glass bottle with heavy square cap, clear liquid, blank label | — | 57-default.png |
