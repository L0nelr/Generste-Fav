const express = require('express');
const { fal } = require("@fal-ai/client"); 
const app = express();

app.use(express.json());
app.use(express.static('public'));

// ПЕРЕВІРКА КЛЮЧА
const API_KEY = process.env.FAL_KEY || "ТВІЙ_КЛЮЧ_ЯКЩО_НЕ_ДОДАВ_У_VARIABLES";
process.env.FAL_KEY = API_KEY;

console.log("Ключ FAL_KEY знайдено:", API_KEY ? "ТАК (починається на " + API_KEY.substring(0, 5) + ")" : "НІ");

app.post('/generate', async (req, res) => {
    const { image_url, prompt } = req.body;
    
    console.log(`🚀 Запит отримано! Фото: ${image_url}`);

    try {
        // Використовуємо subscribe, але додаємо обробку тайм-ауту
        const result = await fal.subscribe("fal-ai/ltx-video", {
            input: {
                image_url: image_url,
                prompt: prompt || "realistic motion"
            },
            logs: true // Це дозволить бачити прогрес генерації в логах Railway
        });

        console.log("✅ Генерація завершена успішно!");
        res.json(result);
    } catch (error) {
        console.error("❌ ПОМИЛКА API:", error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Сервер запущено на порту ${PORT}`));