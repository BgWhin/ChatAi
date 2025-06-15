// File: api/handler.js (REVISED FOR VERCEL DEPLOYMENT)

require('dotenv').config();
process.noDeprecation = true;

const express = require("express");
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { kv } = require('@vercel/kv'); // <-- Impor Vercel KV

// Asumsi file-file ini juga ada di dalam direktori /api
const { weatherTool, getWeatherDataWttrIn } = require('./public/cuaca.js');
const { searchTool, performWebSearchImplementation } = require('./public/search.js');
const { cloudinaryTool, uploadImageImplementation, listImagesImplementation } = require('./public/cloudinary.js');

// =================================================================
// KONFIGURASI APLIKASI
// =================================================================
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(cors());

const geminiModel = "gemini-1.5-flash-latest"; // Gunakan model terbaru untuk performa terbaik
const geminiApiKey = process.env.GEMINI_API_KEY;
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

// Vercel secara otomatis menyediakan variabel ini saat deployment
const vercelUrl = process.env.VERCEL_URL;

// =================================================================
// LOGIKA INTI GEMINI (Disalin dari server.js asli Anda)
// =================================================================
async function runGeminiConversation(prompt, history, imageData, mimeType) {
    if (!geminiApiKey) {
        throw new Error("Gemini API Key not configured.");
    }

    const userParts = [];
    if (prompt) userParts.push({ text: prompt });
    if (imageData && mimeType) {
        userParts.push({ inlineData: { mimeType: mimeType, data: imageData } });
    }
    
    if (userParts.length === 0) {
        throw new Error("Prompt atau gambar tidak boleh kosong.");
    }
    
    let currentContents = [...(history || []), { role: "user", parts: userParts }];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    try {
        console.log(`[Gemini Core] Sending to Gemini. Contents length: ${currentContents.length}`);
        
        let payload = {
            contents: currentContents,
            tools: [weatherTool, searchTool, cloudinaryTool],
        };

        let apiResponse = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text();
            console.error(`[Gemini Core] API request failed:`, apiResponse.status, errorBody);
            throw new Error(`Gemini API error: ${apiResponse.status} - ${errorBody.substring(0, 200)}`);
        }

        let geminiResponseData = await apiResponse.json();
        
        let candidate = geminiResponseData.candidates?.[0];
        let functionCallPart = candidate?.content?.parts?.find(p => p.functionCall);

        if (functionCallPart && functionCallPart.functionCall) {
            console.log("[Gemini Core] Function call requested:", functionCallPart.functionCall.name);
            const functionCall = functionCallPart.functionCall;
            const functionName = functionCall.name;
            const args = functionCall.args;
            
            currentContents.push(candidate.content);

            let functionResponseData;
            if (functionName === "getCurrentWeather") {
                functionResponseData = await getWeatherDataWttrIn(args.city);
            } else if (functionName === "performWebSearch") {
                functionResponseData = await performWebSearchImplementation(args.query);
            } else if (functionName === "uploadImageToCloudinary") {
                functionResponseData = await uploadImageImplementation(imageData, args.folder, args.public_id);
            } else if (functionName === "listImagesInCloudinary") {
                functionResponseData = await listImagesImplementation(args.folder);
            } else {
                console.error(`[Gemini Core] Unknown function call: ${functionName}`);
                functionResponseData = { error: `Fungsi ${functionName} tidak dikenal.` };
            }
            
            currentContents.push({
                role: "user",
                parts: [{ functionResponse: { name: functionName, response: functionResponseData } }]
            });

            console.log("[Gemini Core] Sending tool result back to Gemini.");
            payload.contents = currentContents;
            
            apiResponse = await fetch(url, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });

            if (!apiResponse.ok) {
                 const errorBody = await apiResponse.text();
                 console.error(`[Gemini Core] API request (after tool) failed:`, apiResponse.status, errorBody);
                 throw new Error(`Gemini API error after tool: ${apiResponse.status} - ${errorBody.substring(0, 200)}`);
            }
            
            geminiResponseData = await apiResponse.json();
        }

        const finalCandidate = geminiResponseData.candidates?.[0];
        if (!finalCandidate || finalCandidate.finishReason === "SAFETY" || !finalCandidate.content?.parts?.[0]?.text) {
             console.warn("[Gemini Core] No valid final response.", JSON.stringify(geminiResponseData, null, 2).substring(0, 500));
             let reason = finalCandidate?.finishReason || "Tidak ada kandidat respons";
             if (geminiResponseData.promptFeedback?.blockReason) {
                 reason = `Permintaan diblokir: ${geminiResponseData.promptFeedback.blockReason}`;
             }
             return { responseText: `Maaf, terjadi masalah: ${reason}. Coba lagi nanti.`, updatedHistory: currentContents };
        }

        const finalText = finalCandidate.content.parts[0].text;
        return {
            responseText: finalText,
            updatedHistory: [...currentContents, finalCandidate.content]
        };

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

// Inisialisasi bot TANPA polling
const bot = new TelegramBot(telegramToken);

// Atur webhook secara dinamis saat serverless function diinisialisasi
// Ini hanya akan berjalan sekali saat Vercel "memanaskan" fungsi Anda
if (vercelUrl && telegramToken) {
    const webhookUrl = `https://${vercelUrl}/telegram-webhook`;
    bot.setWebHook(webhookUrl)
       .then(() => console.log(`Telegram webhook successfully set to: ${webhookUrl}`))
       .catch(err => console.error('ERROR: Failed to set Telegram webhook:', err.message));
}

// Handler untuk bot Telegram yang akan dipanggil oleh endpoint di bawah
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userInput = msg.text;

    if (!userInput) {
        console.log(`[Telegram] Ignored non-text message from chat: ${chatId}`);
        return;
    }

    if (userInput.startsWith('/')) {
        if (userInput === '/start') {
            await bot.sendMessage(chatId, "Halo! Saya adalah Asisten AI Gemini Anda. Kirimkan saya pesan untuk memulai percakapan.");
        } else if (userInput === '/clear') {
            await kv.del(`chat:${chatId}`); // Hapus riwayat dari Vercel KV
            await bot.sendMessage(chatId, "Riwayat percakapan telah dihapus.");
        }
        return;
    }

    try {
        await bot.sendChatAction(chatId, 'typing');

        // Ambil riwayat chat dari Vercel KV
        const userHistory = await kv.get(`chat:${chatId}`) || [];

        console.log(`[Telegram] Processing message from chatId: ${chatId}`);
        const result = await runGeminiConversation(userInput, userHistory, null, null);

        // Simpan riwayat chat yang diperbarui ke Vercel KV
        // Key: 'chat:12345678', Value: array history
        await kv.set(`chat:${chatId}`, result.updatedHistory);
        
        await bot.sendMessage(chatId, result.responseText, { parse_mode: 'Markdown' });
    } catch (error) {
        console.error(`[Telegram] Error processing message for chat ${chatId}:`, error);
        await bot.sendMessage(chatId, `Maaf, terjadi kesalahan di server: ${error.message}`);
    }
});


// Endpoint tunggal yang menangani SEMUA permintaan POST
// Ini akan menerima permintaan dari Web Chat dan Telegram Webhook
app.post('*', async (req, res) => {
    try {
        // Cek jika permintaan berasal dari Telegram Webhook
        // Ciri khasnya adalah adanya field 'update_id' di body
        if (req.body && req.body.update_id) {
            console.log('[Handler] Received update from Telegram webhook.');
            bot.processUpdate(req.body);
            res.status(200).send('OK'); // Respon cepat ke Telegram bahwa update diterima
        }
        // Jika tidak, asumsikan ini adalah permintaan dari Web Chat
        else {
            console.log('[Handler] Received request from Web Chat.');
            const { prompt, history, imageData, mimeType } = req.body;

            // Validasi input dari web chat
            if (!prompt && !imageData) {
                return res.status(400).json({ error: "Prompt atau gambar diperlukan." });
            }

            const result = await runGeminiConversation(prompt, history, imageData, mimeType);
            res.json({
                response: result.responseText,
                updatedHistory: result.updatedHistory
            });
        }
    } catch (error) {
        console.error("[Handler] General Error in POST handler:", error);
        res.status(500).json({ error: `Server error: ${error.message}` });
    }
});

// Penting: Hapus semua kode `app.listen()` dari file asli.

// Ekspor aplikasi Express agar Vercel bisa menggunakannya sebagai Serverless Function
module.exports = app;
