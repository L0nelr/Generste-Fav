const express = require('express');
const { fal } = require("@fal-ai/client"); 
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Перевірка ключа (пріоритет змінним Railway)
if (!process.env.FAL_KEY) {
    process.env.FAL_KEY = "ТВІЙ_API_КЛЮЧ";
}

app.post('/generate', async (req, res) => {
    const { image_url, prompt } = req.body;

    if (!image_url) {
        return res.status(400).json({ error: "Будь ласка, вкажіть посилання на фото" });
    }

    try {
        console.log(`🎬 Тестова генерація LTX-Video для: ${image_url}`);
        
        // Повертаємо модель ltx-video
        const result = await fal.subscribe("fal-ai/ltx-video", {
            input: {
                image_url: image_url,
                prompt: prompt || "low motion, realistic"
            }
        });

        res.json(result);
    } catch (error) {
        console.error("Помилка API:", error);
        res.status(500).json({ error: error.message });
    }
});

// Використовуємо порт 8080, як того вимагає Railway
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Тестовий сервер на базі LTX запущено на порту ${PORT}`));