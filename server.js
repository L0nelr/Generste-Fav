const express = require('express');
const { fal } = require("@fal-ai/client");
const app = express();

app.use(express.json());

// Логування для відстеження процесу
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 📡 Запит: ${req.method} ${req.url}`);
    next();
});

const FAL_KEY = process.env.FAL_KEY;

// 1. ЗАПУСК ГЕНЕРАЦІЇ (Тільки черга)
app.post('/start', async (req, res) => {
    console.log("📥 Спроба запуску генерації...");
    try {
        const { image_url, prompt } = req.body;
        
        if (!image_url) {
            return res.status(400).json({ error: "Вставте посилання на фото" });
        }

        // Пряма відправка в чергу без вебхуків
        const { request_id } = await fal.queue.submit("fal-ai/ltx-video", {
            input: { image_url, prompt: prompt || "natural motion" }
        });
        
        console.log(`✅ Запит у черзі Fal. ID: ${request_id}`);
        res.json({ request_id });
    } catch (error) {
        console.error("❌ Помилка Fal API (Start):", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 2. ПЕРЕВІРКА СТАТУСУ (Прямий запит до Fal API)
app.get('/status/:id', async (req, res) => {
    try {
        const requestId = req.params.id;
        
        // Дізнаємося актуальний статус у нейромережі
        const statusUpdate = await fal.queue.status("fal-ai/ltx-video", { requestId });

        if (statusUpdate.status === "COMPLETED") {
            // Якщо готово — забираємо відео
            const result = await fal.queue.result("fal-ai/ltx-video", { requestId });
            console.log(`🎉 Відео успішно згенеровано для ID: ${requestId}`);
            return res.json(result);
        }
        
        // Якщо ще генерується — повертаємо поточний статус
        res.status(202).json({ status: statusUpdate.status });
    } catch (error) {
        console.error(`❌ Помилка перевірки статусу для ${req.params.id}:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.use(express.static('public'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Надійний сервер (Stateless) запущено на порту ${PORT}`);
});