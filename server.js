const express = require('express');
const { fal } = require("@fal-ai/serverless-client");
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static('public'));

// Встав свій ключ тут або через змінні оточення Railway
process.env.FAL_KEY = "ТВІЙ_API_КЛЮЧ";

app.post('/generate', async (req, res) => {
    const { image_url, prompt } = req.body;
    try {
        // Використовуємо модель LTX-Video або Wan 
        const result = await fal.subscribe("fal-ai/ltx-video", {
            input: {
                image_url: image_url,
                prompt: prompt
            },
            pollInterval: 5000, // перевірка готовності кожні 5 сек
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущено на порту ${PORT}`));