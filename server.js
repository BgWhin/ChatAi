// File: server.js (REVISED FOR VERCEL DEPLOYMENT AT ROOT)

require('dotenv').config();
process.noDeprecation = true;

const express = require("express");
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { kv } = require('@vercel/kv');
const { injectSpeedInsights } require('@vercel/speed-insights');

// Path yang benar sesuai struktur Anda
const { weatherTool, getWeatherDataWttrIn } = require('./public/cuaca.js');
const { searchTool, performWebSearchImplementation } = require('./public/search.js');
const { cloudinaryTool, uploadImageImplementation, listImagesImplementation } = require('./public/cloudinary.js');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const geminiModel = "gemini-2.0-flash";
const geminiApiKey = process.env.GEMINI_API_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const vercelUrl = process.env.VERCEL_URL;

injectSpeedInsights();
// =================================================================
// LOGIKA INTI GEMINI (Salin-tempel dari versi sebelumnya, tidak ada perubahan)
// =================================================================
async function runGeminiConversation(prompt, history, imageData, mimeType) {
    // ... PASTE KODE FUNGSI runGeminiConversation ANDA DARI FILE LAMA ...
    // ... Ini sama persis dengan yang ada di file handler.js sebelumnya ...
    if (!geminiApiKey) throw new Error("Gemini API Key not configured.");
    const userParts = [];
    if (prompt) userParts.push({ text: prompt });
    if (imageData && mimeType) userParts.push({ inlineData: { mimeType: mimeType, data: imageData } });
    if (userParts.length === 0) throw new Error("Prompt atau gambar tidak boleh kosong.");
    let currentContents = [...(history || []), { role: "user", parts: userParts }];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
    try {
        let payload = { contents: currentContents, tools: [weatherTool, searchTool, cloudinaryTool] };
        let apiResponse = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            throw new Error(`Gemini API error: ${apiResponse.status} - ${errorBody.substring(0, 200)}`);
        }
        let geminiResponseData = await apiResponse.json();
        let candidate = geminiResponseData.candidates?.[0];
        let functionCallPart = candidate?.content?.parts?.find(p => p.functionCall);
        if (functionCallPart && functionCallPart.functionCall) {
            const functionCall = functionCallPart.functionCall;
            const functionName = functionCall.name;
            const args = functionCall.args;
            currentContents.push(candidate.content);
            let functionResponseData;
            if (functionName === "getCurrentWeather") functionResponseData = await getWeatherDataWttrIn(args.city);
            else if (functionName === "performWebSearch") functionResponseData = await performWebSearchImplementation(args.query);
            else if (functionName === "uploadImageToCloudinary") functionResponseData = await uploadImageImplementation(imageData, args.folder, args.public_id);
            else if (functionName === "listImagesInCloudinary") functionResponseData = await listImagesImplementation(args.folder);
            else functionResponseData = { error: `Fungsi ${functionName} tidak dikenal.` };
            currentContents.push({ role: "user", parts: [{ functionResponse: { name: functionName, response: functionResponseData } }] });
            payload.contents = currentContents;
            apiResponse = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            if (!apiResponse.ok) {
                 const errorBody = await apiResponse.text();
                 throw new Error(`Gemini API error after tool: ${apiResponse.status} - ${errorBody.substring(0, 200)}`);
            }
            geminiResponseData = await apiResponse.json();
        }
        const finalCandidate = geminiResponseData.candidates?.[0];
        if (!finalCandidate || finalCandidate.finishReason === "SAFETY" || !finalCandidate.content?.parts?.[0]?.text) {
             let reason = finalCandidate?.finishReason || "No valid response candidate";
             if (geminiResponseData.promptFeedback?.blockReason) reason = `Request blocked: ${geminiResponseData.promptFeedback.blockReason}`;
             return { responseText: `Maaf, terjadi masalah: ${reason}. Coba lagi nanti.`, updatedHistory: currentContents };
        }
        const finalText = finalCandidate.content.parts[0].text;
        return { responseText: finalText, updatedHistory: [...currentContents, finalCandidate.content] };
    } catch (err) {
        console.error("[Gemini Core] Uncaught error:", err);
        throw err;
    }
}


// =================================================================
// PENANGANAN PERMINTAAN (HANDLER UTAMA UNTUK VERCEL)
// =================================================================
if (!telegramToken) {
    console.warn("TELEGRAM_BOT_TOKEN tidak ditemukan. Bot Telegram tidak akan aktif.");
}

const bot = new TelegramBot(telegramToken);

// Atur webhook jika berjalan di Vercel
if (vercelUrl && telegramToken) {
    const webhookUrl = `https://${vercelUrl}/telegram-webhook`;
    bot.setWebHook(webhookUrl)
       .then(() => console.log(`Telegram webhook successfully set to: ${webhookUrl}`))
       .catch(err => console.error('ERROR: Failed to set Telegram webhook:', err.message));
}

// Handler untuk bot Telegram (akan dipanggil oleh endpoint di bawah)
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userInput = msg.text;

    if (!userInput) return;
    if (userInput.startsWith('/')) {
        if (userInput === '/start') await bot.sendMessage(chatId, "Halo! Saya Asisten AI Gemini Anda.");
        else if (userInput === '/clear') {
            await kv.del(`chat:${chatId}`);
            await bot.sendMessage(chatId, "Riwayat percakapan telah dihapus.");
        }
        return;
    }

    try {
        await bot.sendChatAction(chatId, 'typing');
        const userHistory = await kv.get(`chat:${chatId}`) || [];
        const result = await runGeminiConversation(userInput, userHistory, null, null);
        await kv.set(`chat:${chatId}`, result.updatedHistory);
        await bot.sendMessage(chatId, result.responseText, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(`[Telegram] Error for chat ${chatId}:`, error);
        await bot.sendMessage(chatId, `Maaf, terjadi kesalahan di server: ${error.message}`);
    }
});

// Endpoint tunggal yang menangani SEMUA permintaan POST
app.post('*', async (req, res) => {
    try {
        if (req.body && req.body.update_id) {
            bot.processUpdate(req.body);
            res.status(200).send('OK');
        } else {
            const { prompt, history, imageData, mimeType } = req.body;
            const result = await runGeminiConversation(prompt, history, imageData, mimeType);
            res.json({ response: result.responseText, updatedHistory: result.updatedHistory });
        }
    } catch (error) {
        console.error("[Handler] General Error:", error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Hapus app.listen(), Vercel menanganinya
// module.exports akan diekspor secara otomatis oleh Vercel build

module.exports = app;
