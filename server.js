const express = require('express');
const { fal } = require("@fal-ai/client");
const app = express();

// Збільшуємо ліміт до 50 Мегабайт
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 📡 Запит: ${req.method} ${req.url}`);
    next();
});

// СЛОВНИК МОДЕЛЕЙ (Маршрутизатор)
const MODEL_ENDPOINTS = {
    "kling": "fal-ai/kling-video/v1/pro/image-to-video",
    "luma": "fal-ai/luma-dream-machine/image-to-video",
    "minimax-img": "fal-ai/minimax/video/image-to-video",
    "wan": "fal-ai/wan/text-to-video",
    "hunyuan": "fal-ai/hunyuan-video",
    "minimax-text": "fal-ai/minimax/video/text-to-video"
};

app.post('/start', async (req, res) => {
    console.log("📥 Спроба запуску генерації...");
    try {
        const { image_url, prompt, negative_prompt, guidance_scale, num_inference_steps, seed, model_id } = req.body;
        
        // Визначаємо, який ендпоінт використовувати
        const endpoint = MODEL_ENDPOINTS[model_id] || MODEL_ENDPOINTS["kling"]; // Kling за замовчуванням
        console.log(`🚀 Обрано модель: ${model_id} -> ${endpoint}`);

        // Формуємо базовий пакет даних
        const inputPayload = { prompt: prompt || "natural motion" };

        // Якщо це Image-to-Video модель і є картинка, додаємо її
        if (image_url && !model_id.includes('text') && model_id !== 'wan' && model_id !== 'hunyuan') {
            inputPayload.image_url = image_url;
        }

        // Додаємо розширені налаштування
        if (negative_prompt) inputPayload.negative_prompt = negative_prompt;
        if (guidance_scale) inputPayload.guidance_scale = Number(guidance_scale);
        if (num_inference_steps) inputPayload.num_inference_steps = Number(num_inference_steps);
        if (seed) inputPayload.seed = Number(seed);

        const { request_id } = await fal.queue.submit(endpoint, { input: inputPayload });
        
        console.log(`✅ Запит у черзі Fal. ID: ${request_id}`);
        // Відправляємо назад request_id та назву моделі для статусу
        res.json({ request_id, endpoint }); 
    } catch (error) {
        console.error("❌ Помилка Fal API (Start):", error.message);
        res.status(500).json({ error: error.message });
    }
});

// Оновлений роут перевірки статусу (приймає ID та ендпоінт)
app.post('/status', async (req, res) => {
    try {
        const { request_id, endpoint } = req.body;
        const statusUpdate = await fal.queue.status(endpoint, { requestId: request_id });

        if (statusUpdate.status === "COMPLETED") {
            const result = await fal.queue.result(endpoint, { requestId: request_id });
            console.log(`🎉 Відео успішно згенеровано!`);
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
    console.log(`🚀 Multi-Model сервер запущено на порту ${PORT}`);
});