const express = require('express');
const { fal } = require("@fal-ai/client");
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Логгер для діагностики - ми побачимо кожен клік у логах Railway
app.use((req, res, next) => {
    console.log(`📡 Запит: ${req.method} ${req.url}`);
    next();
});

const resultsStore = {};
process.env.FAL_KEY = process.env.FAL_KEY || "ТВІЙ_КЛЮЧ";

// 1. Ендпоінт для запуску
app.post('/start', async (req, res) => {
    try {
        const { image_url, prompt } = req.body;
        
        // Формуємо URL вебхука професійно
        const domain = process.env.RAILWAY_PUBLIC_DOMAIN || req.get('host');
        const protocol = domain.includes('localhost') ? 'http' : 'https';
        const webhookUrl = `${protocol}://${domain}/webhook`;

        console.log(`🚀 Подаю в чергу. Webhook полетів на: ${webhookUrl}`);

        const { request_id } = await fal.queue.submit("fal-ai/ltx-video", {
            input: { image_url, prompt: prompt || "realistic motion" },
            webhook_url: webhookUrl
        });
        
        res.json({ request_id });
    } catch (error) {
        console.error("❌ Помилка старту:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// 2. Приймач Webhook
app.post('/webhook', (req, res) => {
    const { request_id, payload, status } = req.body;
    console.log(`🔔 Webhook отримано для ID: ${request_id} (Статус: ${status})`);
    
    if (status === "COMPLETED") {
        resultsStore[request_id] = payload;
    }
    res.status(200).send("OK");
});

// 3. Перевірка статусу
app.get('/check/:id', (req, res) => {
    const result = resultsStore[req.params.id];
    if (result) {
        res.json(result);
    } else {
        res.status(202).json({ status: "processing" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Сервер запущено на порту ${PORT}`));