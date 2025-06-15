// cuaca.js

// Definisi Tool untuk Gemini
const weatherTool = {
    functionDeclarations: [
        {
            name: "getCurrentWeather",
            description: "Get the current weather in a given city or location. It can also understand provinces or broader areas.",
            parameters: {
                type: "OBJECT",
                properties: {
                    city: {
                        type: "STRING",
                        description: "The city name, province, or general location (e.g., Jakarta, Jawa Barat, London, Mount Everest)."
                    }
                },
                required: ["city"]
            }
        }
    ]
};

// Fungsi untuk mendapatkan data cuaca dari wttr.in
async function getWeatherDataWttrIn(location) {
    if (!location) {
        console.error("Location name is required for weather lookup.");
        return { error: "Nama lokasi tidak diberikan. Tolong sebutkan kota atau lokasi yang ingin Anda ketahui cuacanya." };
    }

    const encodedLocation = encodeURIComponent(location);
    const wttrUrl = `https://wttr.in/${encodedLocation}?format=j1`;

    try {
        console.log(`[cuaca.js] Fetching weather for ${location} from wttr.in...`);
        const response = await fetch(wttrUrl, {
            headers: {
                'User-Agent': 'GeminiChatAI-Project/1.0'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[cuaca.js] wttr.in API Error (HTTP ${response.status}) for ${location}:`, errorText.substring(0, 500));
            return { error: `Maaf, saya tidak bisa mendapatkan data cuaca untuk ${location} saat ini. Layanan cuaca mungkin tidak mengenali lokasi tersebut atau sedang ada gangguan.` };
        }

        const data = await response.json();

        if (data.current_condition && data.current_condition.length > 0) {
            const current = data.current_condition[0];
            const nearestArea = data.nearest_area && data.nearest_area.length > 0 ? data.nearest_area[0] : null;
            const weatherDescArray = data.weather && data.weather.length > 0 ? data.weather[0].hourly : null;

            let cityName = location;
            let region = "";
            let country = "";

            if (nearestArea) {
                if (nearestArea.areaName && nearestArea.areaName.length > 0) cityName = nearestArea.areaName[0].value;
                if (nearestArea.region && nearestArea.region.length > 0) region = nearestArea.region[0].value;
                if (nearestArea.country && nearestArea.country.length > 0) country = nearestArea.country[0].value;
            }
            
            let fullLocation = cityName;
            if (region && region.toLowerCase() !== cityName.toLowerCase()) fullLocation += `, ${region}`; // Hindari duplikasi jika region = city
            if (country) fullLocation += `, ${country}`;

            let description = "Tidak ada deskripsi";
            if (current.weatherDesc && current.weatherDesc.length > 0 && current.weatherDesc[0].value) {
                description = current.weatherDesc[0].value;
            } else if (weatherDescArray && weatherDescArray.length > 0 && weatherDescArray[0].weatherDesc && weatherDescArray[0].weatherDesc.length > 0 && weatherDescArray[0].weatherDesc[0].value) {
                description = weatherDescArray[0].weatherDesc[0].value;
            }

            return {
                location: fullLocation,
                temperature: `${current.temp_C}°C`,
                feels_like: `${current.FeelsLikeC}°C`,
                description: description,
                humidity: `${current.humidity}%`,
                wind_speed: `${current.windspeedKmph} km/jam (arah ${current.winddir16Point})`,
                precipitation_mm: `${current.precipMM} mm`,
                visibility_km: `${current.visibility} km`,
                pressure_mb: `${current.pressure} mb`,
                observation_time: current.observation_time,
            };
        } else {
            console.error("[cuaca.js] wttr.in response format unexpected or no current condition for location:", location, JSON.stringify(data, null, 2).substring(0, 500));
            return { error: `Format data cuaca dari layanan tidak sesuai atau tidak ada informasi kondisi saat ini untuk ${location}.` };
        }
    } catch (error) {
        console.error(`[cuaca.js] Error calling wttr.in for ${location}:`, error);
        return { error: `Terjadi kesalahan internal saat mencoba mengambil data cuaca untuk ${location}.` };
    }
}

// Ekspor fungsi dan variabel yang dibutuhkan oleh server.js
module.exports = {
    weatherTool,
    getWeatherDataWttrIn
};
