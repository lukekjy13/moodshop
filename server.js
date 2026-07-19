// server.js
// ------------------------------------------------------------
// 이 서버가 하는 일 두 가지:
// 1. 브라우저가 "이 검색어로 상품 찾아줘" 하면 네이버 API에 대신 물어봐줌
// 2. 브라우저가 "이 예산으로 뭐 살까?" 하면 구글 Gemini(AI)한테 물어보고,
//    AI가 추천한 키워드로 다시 네이버에서 실제 상품을 찾아서 같이 돌려줌
//
// 두 경우 다 비밀 키(API 키)는 이 파일(서버)에만 있고 브라우저엔 절대 안 보냄.
// ------------------------------------------------------------

import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
  console.warn(
    "⚠️  .env 파일에 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 없어요! " +
      ".env.example을 복사해서 .env를 만들고 키를 채워주세요."
  );
}
if (!GEMINI_API_KEY) {
  console.warn(
    "⚠️  .env 파일에 GEMINI_API_KEY가 없어요! AI 추천 챗봇은 이 키가 있어야 작동해요. " +
      "(Google AI Studio에서 무료로 발급 가능: aistudio.google.com/apikey)"
  );
}

app.use(express.static(path.join(__dirname, "public")));

function cleanTitle(title) {
  return title.replace(/<\/?b>/g, "").replace(/&amp;/g, "&");
}

// ---------------------------------------------------------
// 네이버 쇼핑 검색 (공통 함수 - /api/search 와 /api/recommend 둘 다 사용)
// ---------------------------------------------------------
async function searchNaver(query, { sort = "sim", display = 20, start = 1 } = {}) {
  const url = new URL("https://openapi.naver.com/v1/search/shop.json");
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", String(start));
  url.searchParams.set("sort", sort);

  const naverRes = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": NAVER_CLIENT_ID,
      "X-Naver-Client-Secret": NAVER_CLIENT_SECRET,
    },
  });

  if (!naverRes.ok) {
    const errorText = await naverRes.text();
    console.error("네이버 API 에러:", naverRes.status, errorText);
    throw new Error("네이버 API 호출에 실패했어요. Client ID/Secret이 맞는지 확인해보세요.");
  }

  const data = await naverRes.json();
  const items = data.items.map((item, i) => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${i}`,
    title: cleanTitle(item.title),
    image: item.image,
    price: Number(item.lprice),
    mall: item.mallName,
    link: item.link,
  }));
  return { items, total: data.total };
}

// 검색 결과 + 자동완성 둘 다 여기서 처리
// display를 작게 요청하면(예: 5) 자동완성용으로 빠르게 씀
// start는 "더 보기"용 페이지네이션 (네이버 API는 최대 1000까지 지원)
app.get("/api/search", async (req, res) => {
  const query = req.query.query;
  const sort = ["sim", "asc", "dsc"].includes(req.query.sort) ? req.query.sort : "sim";
  let display = parseInt(req.query.display, 10);
  if (!Number.isFinite(display) || display < 1 || display > 100) display = 30;
  let start = parseInt(req.query.start, 10);
  if (!Number.isFinite(start) || start < 1) start = 1;
  if (start > 1000) {
    // 네이버 API는 start가 1000을 넘으면 더 이상 지원 안 함 → 조용히 1페이지로 되돌리지 않고 "더 없음"으로 응답
    return res.json({ items: [], total: 0 });
  }

  if (!query) {
    return res.status(400).json({ error: "query 파라미터가 필요해요" });
  }

  try {
    const { items, total } = await searchNaver(query, { sort, display, start });
    res.json({ items, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || "서버 내부 오류가 발생했어요" });
  }
});

// ---------------------------------------------------------
// AI 추천 챗봇: "이 예산으로 뭐 살까?"
// 1) Gemini한테 예산/요청을 주고 "짧은 코멘트 + 검색 키워드 3개"를 JSON으로 받음
// 2) 그 키워드들로 네이버에서 실제 상품을 찾음
// 3) 코멘트 + 상품들을 묶어서 브라우저로 돌려줌
// ---------------------------------------------------------
app.post("/api/recommend", async (req, res) => {
  const { message } = req.body; // 예: "3만원으로 생일선물 뭐 살까?"

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "서버에 GEMINI_API_KEY가 설정되어 있지 않아요." });
  }
  if (!message || !message.trim()) {
    return res.status(400).json({ error: "message가 필요해요" });
  }

  try {
    const prompt = `너는 쇼핑몰 추천 도우미야. 사용자가 이렇게 말했어: "${message}"

이 요청에 맞는 네이버 쇼핑 검색 키워드를 정확히 3개 추천하고, 짧은 한국어 코멘트도 하나 써줘.
반드시 아래 JSON 형식으로만 답해. 다른 텍스트나 마크다운 없이 JSON만.
{"comment": "친근한 말투로 1~2문장 코멘트", "keywords": ["검색어1", "검색어2", "검색어3"]}`;

    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("Gemini API 에러:", geminiRes.status, errText);
      return res.status(500).json({ error: "AI 응답을 가져오는 데 실패했어요." });
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // AI가 가끔 ```json 코드블럭으로 감싸서 줄 때가 있어서 벗겨냄
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return res.status(500).json({ error: "AI 응답을 이해하지 못했어요. 다시 시도해보세요." });
    }

    const keywords = Array.isArray(parsed.keywords) ? parsed.keywords.slice(0, 3) : [];

    // 각 키워드로 네이버 검색 (동시에 실행)
    const groups = await Promise.all(
      keywords.map(async (kw) => {
        try {
          const { items } = await searchNaver(kw, { display: 6 });
          return { keyword: kw, items };
        } catch {
          return { keyword: kw, items: [] };
        }
      })
    );

    res.json({ comment: parsed.comment || "", groups });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "서버 내부 오류가 발생했어요" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ 서버 실행 중! 브라우저에서 http://localhost:${PORT} 열어보세요`);
});
