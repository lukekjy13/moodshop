// server.js
// ------------------------------------------------------------
// 이 서버가 하는 일은 딱 하나예요:
// 브라우저가 "이 검색어로 상품 찾아줘" 하고 요청하면,
// 서버가 (아무도 모르는 비밀 키를 들고) 네이버한테 대신 물어보고
// 결과를 정리해서 브라우저한테 돌려주는 것.
//
// 이렇게 중간에 서버를 두는 이유: 브라우저 코드는 누구나 개발자 도구로
// 열어볼 수 있어서, 거기에 비밀 키를 넣으면 다 노출돼요.
// 서버 코드는 사용자한테 안 보이니까 키를 여기 숨기는 거예요.
// ------------------------------------------------------------

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config(); // .env 파일 읽어서 process.env에 넣어줌

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.warn(
    "⚠️  .env 파일에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 없어요! " +
      ".env.example을 복사해서 .env를 만들고 키를 채워주세요."
  );
}

// public 폴더 안의 파일들(html, css, js)을 그대로 브라우저에 보여주기
app.use(express.static(path.join(__dirname, "public")));

// 브라우저가 title 안에 섞여오는 <b>태그를 제거하는 함수
function cleanTitle(title) {
  return title.replace(/<\/?b>/g, "").replace(/&amp;/g, "&");
}

// 핵심 API: /api/search?query=신발
app.get("/api/search", async (req, res) => {
  const query = req.query.query;
  // sort: sim=정확도순, asc=낮은가격순, dsc=높은가격순 (프론트에서 "추천" 만들 때 asc로도 요청함)
  const sort = ["sim", "asc", "dsc"].includes(req.query.sort) ? req.query.sort : "sim";

  if (!query) {
    return res.status(400).json({ error: "query 파라미터가 필요해요" });
  }

  try {
    const url = new URL("https://openapi.naver.com/v1/search/shop.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "20"); // 최대 몇 개 가져올지
    url.searchParams.set("sort", sort);

    const naverRes = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": CLIENT_ID,
        "X-Naver-Client-Secret": CLIENT_SECRET,
      },
    });

    if (!naverRes.ok) {
      const errorText = await naverRes.text();
      console.error("네이버 API 에러:", naverRes.status, errorText);
      return res.status(naverRes.status).json({
        error: "네이버 API 호출에 실패했어요. Client ID/Secret이 맞는지, '검색' API 권한이 켜져있는지 확인해보세요.",
      });
    }

    const data = await naverRes.json();

    // 필요한 정보만 깔끔하게 정리해서 브라우저로 보내줌
    const items = data.items.map((item, i) => ({
      id: `${Date.now()}-${i}`,
      title: cleanTitle(item.title),
      image: item.image,
      price: Number(item.lprice), // 최저가 (문자열로 와서 숫자로 변환)
      mall: item.mallName,
      link: item.link,
    }));

    res.json({ items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버 내부 오류가 발생했어요" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중! 브라우저에서 http://localhost:${PORT} 열어보세요`);
});
