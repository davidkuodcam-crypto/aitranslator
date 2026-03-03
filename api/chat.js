export default async function handler(req, res) {
  // ==========================================
  // 1. CORS 安全防護設定 (專屬長照翻譯助手)
  // ==========================================
  const allowedOrigins = [
    'https://ai_translator.vercel.app', // ⚠️ 部署後，請記得將這裡換成您「新」Vercel 專案的正式網址
    'https://davidkuodcam-crypto.github.io',      // 您的 GitHub Pages (涵蓋 ai_translator 倉庫)
    'http://localhost:3000',                 
    'http://127.0.0.1:5500'                  
  ];

  const requestOrigin = req.headers.origin;

  if (allowedOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  }

  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // 處理瀏覽器的 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ==========================================
  // 2. 阻擋非 POST 請求
  // ==========================================
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // ==========================================
  // 3. 讀取 API KEY 與呼叫 Gemini
  // ==========================================
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("Error: GEMINI_API_KEY is missing in Vercel env vars");
    return res.status(500).json({ error: 'Vercel 環境變數中找不到 GEMINI_API_KEY，請檢查設定並 Redeploy。' });
  }

  try {
    const GEMINI_MODEL = "gemini-2.5-flash"; 
    const GOOGLE_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = req.body;

    // 這裡我們不主動塞入 Google Search 工具，
    // 讓 AI 專注於處理前端傳來的翻譯與 RAG 知識庫 Prompt，速度會快很多。
    
    const response = await fetch(GOOGLE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
        const googleError = data.error?.message || 'Unknown Gemini API Error';
        console.error("Gemini API Error:", googleError);
        return res.status(500).json({ error: `Google API Error: ${googleError}` });
    }

    return res.status(200).json(data);

  } catch (error) {
    console.error("Server Internal Error:", error);
    return res.status(500).json({ error: `Server Error: ${error.message}` });
  }
}