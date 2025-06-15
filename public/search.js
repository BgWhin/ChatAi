// search.js
require('dotenv').config(); // Jika API key disimpan di .env

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY;
const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;

// search.js
const searchTool = {
    functionDeclarations: [
        {
            name: "performWebSearch",
            description: "Kamu adalah asisten AI yang sangat membantu. Jika kamu tidak tahu jawaban pasti prioritaskan untuk menggunakan alat pencarian web yang tersedia untuk menemukan jawaban yang akurat sebelum menjawab, seperti mencari informasi terkini, peristiwa aktual, harga suatu barang, tanggal spesifik di masa depan (seperti hari libur atau acara), atau fakta yang kemungkinan besar tidak ada dalam data pengetahuan internal model. Sangat berguna untuk pertanyaan tentang berita, tren, harga produk, jadwal, atau informasi yang sering berubah.",
            // ... sisa parameter
            parameters: {
                type: "OBJECT",
                properties: {
                    query: {
                        type: "STRING",
                        description: "Kata kunci pencarian yang relevan untuk menemukan jawaban atas pertanyaan pengguna."
                    }
                },
                required: ["query"]
            }
        }
    ]
};

async function performWebSearchImplementation(query) {
    if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_CSE_ID) {
        console.error("[search.js] Google Search API Key or CSE ID is not configured.");
        return { error: "Layanan pencarian web tidak dikonfigurasi di server." };
    }
    if (!query) {
        console.warn("[search.js] Web search called without a query.");
        return { error: "Query pencarian tidak diberikan." };
    }

    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_SEARCH_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&num=3`; // Ambil 3 hasil teratas

    console.log(`[search.js] Performing web search for: "${query}"`);

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("[search.js] Google Search API Error:", data.error.message);
            return { error: `Error dari API pencarian Google: ${data.error.message}` };
        }

        if (data.items && data.items.length > 0) {
            const results = data.items.map(item => ({
                title: item.title,
                link: item.link,
                snippet: item.snippet
            }));
            // Mengembalikan ringkasan hasil ke Gemini.
            // Gemini akan menggunakan ini untuk merumuskan jawabannya.
            let summary = "Berikut adalah beberapa hasil pencarian web yang relevan:\n";
            results.forEach((res, index) => {
                summary += `${index + 1}. Judul: ${res.title}\nCuplikan: ${res.snippet}\n(Sumber: ${res.link})\n\n`;
            });
            // Atau kembalikan objek/array jika Anda ingin Gemini memprosesnya secara lebih terstruktur.
            // Untuk kesederhanaan, kita kirim string summary.
            // Penting: Jangan kirim terlalu banyak data. Cukup beberapa hasil.
            return { searchResultsSummary: summary, resultsArray: results }; // Mengembalikan summary dan array mentah
        } else {
            return { searchResultsSummary: "Tidak ada hasil pencarian yang relevan ditemukan.", resultsArray: [] };
        }
    } catch (error) {
        console.error("[search.js] Error fetching search results:", error);
        return { error: "Gagal melakukan pencarian web karena kesalahan jaringan atau server." };
    }
}

module.exports = {
    searchTool,
    performWebSearchImplementation
};
