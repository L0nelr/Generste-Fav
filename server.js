const express = require('express');
const { fal } = require("@fal-ai/client");
const app = express();

app.use(express.json());

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 📡 Запит: ${req.method} ${req.url}`);
    next();
});

const FAL_KEY = process.env.FAL_KEY;

app.post('/start', async (req, res) => {
    console.log("📥 Спроба запуску генерації...");
    try {
        // Отримуємо ВСІ параметри з сайту
        const { image_url, prompt, negative_prompt, guidance_scale, num_inference_steps, seed } = req.body;
        
        if (!image_url) {
            return res.status(400).json({ error: "Вставте посилання на фото" });
        }

        // Формуємо базовий пакет даних
        const inputPayload = {
            image_url,
            prompt: prompt || "natural motion"
        };

        // Додаємо розширені налаштування, якщо користувач їх ввів
        if (negative_prompt) inputPayload.negative_prompt = negative_prompt;
        if (guidance_scale) inputPayload.guidance_scale = Number(guidance_scale);
        if (num_inference_steps) inputPayload.num_inference_steps = Number(num_inference_steps);
        if (seed) inputPayload.seed = Number(seed);

        console.log("📦 Відправляю параметри у Fal.ai:", inputPayload);

        const { request_id } = await fal.queue.submit("fal-ai/ltx-video", {
            input: inputPayload
        });
        
        console.log(`✅ Запит у черзі Fal. ID: ${request_id}`);
        res.json({ request_id });
    } catch (error) {
        console.error("❌ Помилка Fal API (Start):", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/status/:id', async (req, res) => {
    try {
        const requestId = req.params.id;
        const statusUpdate = await fal.queue.status("fal-ai/ltx-video", { requestId });

        if (statusUpdate.status === "COMPLETED") {
            const result = await fal.queue.result("fal-ai/ltx-video", { requestId });
            console.log(`🎉 Відео успішно згенеровано для ID: ${requestId}`);
            return res.json(result);
        }
        
        res.status(202).json({ status: statusUpdate.status });
    } catch (error) {
        console.error(`❌ Помилка перевірки статусу:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.use(express.static('public'));

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Pro-сервер запущено на порту ${PORT}`);
});