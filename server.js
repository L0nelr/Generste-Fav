const express = require('express');
const { fal } = require("@fal-ai/client"); 
const app = express();

app.use(express.json());
app.use(express.static('public'));

process.env.FAL_KEY = process.env.FAL_KEY || "ТВІЙ_КЛЮЧ";

// 1. Початок генерації
app.post('/start', async (req, res) => {
    try {
        const { image_url, prompt } = req.body;
        console.log(`🚀 Подано в чергу: ${image_url}`);
        
        // Відправляємо запит у чергу БЕЗ очікування завершення
        const { request_id } = await fal.queue.submit("fal-ai/ltx-video", {
            input: { image_url, prompt: prompt || "realistic motion" }
        });
        
        res.json({ request_id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Перевірка статусу
app.get('/status/:id', async (req, res) => {
    try {
        const result = await fal.queue.result("fal-ai/ltx-video", {
            requestId: req.params.id,
        });
        res.json(result);
    } catch (error) {
        // Якщо ще не готово, API може видати помилку або пустий статус
        res.status(202).json({ status: "processing" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ Сервер черги запущено на порту ${PORT}`));