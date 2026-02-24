const express = require('express');
const { fal } = require("@fal-ai/client");
const app = express();

// 1. ПАРСИНГ JSON (має бути на самому початку)
app.use(express.json());

// 2. ДІАГНОСТИКА: цей лог покаже кожен запит у консолі Railway
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] 📡 Запит: ${req.method} ${req.url}`);
    next();
});

const resultsStore = {};

// Переконайся, що FAL_KEY додано у Variables на Railway!
const FAL_KEY = process.env.FAL_KEY;

// 3. API МАРШРУТИ (Обов'язково ПЕРЕД static)
app.post('/start', async (req, res) => {
    console.log("📥 Спроба запуску генерації...");
    try {
        const { image_url, prompt } = req.body;
        
        if (!image_url) {
            console.error("❌ Помилка: image_url порожній");
            return res.status(400).json({ error: "Вставте посилання на фото" });
        }

        const domain = process.env.RAILWAY_PUBLIC_DOMAIN || req.get('host');
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        const webhookUrl = `${protocol}://${domain}/webhook`;

        console.log(`🚀 Надсилаю в Fal.ai. Webhook: ${webhookUrl}`);

        const { request_id } = await fal.queue.submit("fal-ai/ltx-video", {
            input: { image_url, prompt: prompt || "natural motion" },
            webhook_url: webhookUrl
        });
        
        console.log(`✅ Успішно! ID запиту: ${request_id}`);
        res.json({ request_id });
    } catch (error) {
        console.error("❌ Помилка Fal API:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/webhook', (req, res) => {
    const { request_id, payload, status } = req.body;
    console.log(`🔔 Отримано Webhook для ${request_id}. Статус: ${status}`);
    if (status === "COMPLETED") {
        resultsStore[request_id] = payload;
    }
    res.status(200).send("OK");
});

app.get('/check/:id', (req, res) => {
    const result = resultsStore[req.params.id];
    if (result) {
        res.json(result);
    } else {
        res.status(202).json({ status: "processing" });
    }
});

// 4. СТАТИЧНІ ФАЙЛИ (після всіх API)
app.use(express.static('public'));

// 5. ЗАПУСК
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер для вашого стартапу запущено на порту ${PORT}`);
});