const express = require('express');
const { fal } = require("@fal-ai/client");
const app = express();

app.use(express.json());
app.use(express.static('public'));

// Тимчасове сховище результатів (у пам'яті сервера)
const resultsStore = {};

process.env.FAL_KEY = process.env.FAL_KEY || "ТВІЙ_КЛЮЧ";

// 1. Ендпоінт для запуску
app.post('/start', async (req, res) => {
    try {
        const { image_url, prompt } = req.body;
        // Railway автоматично підхоплює твою адресу
        const publicUrl = process.env.RAILWAY_PUBLIC_DOMAIN 
            ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` 
            : `${req.protocol}://${req.get('host')}`;
            
        const webhookUrl = `${publicUrl}/webhook`;

        console.log(`📡 Надсилаю запит із Webhook URL: ${webhookUrl}`);

        const { request_id } = await fal.queue.submit("fal-ai/ltx-video", {
            input: { image_url, prompt: prompt || "natural motion" },
            webhook_url: webhookUrl
        });
        
        res.json({ request_id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Ендпоінт-приймач (сюди Fal.ai пришле результат)
app.post('/webhook', (req, res) => {
    const { request_id, payload, status } = req.body;
    console.log(`🔔 Отримано Webhook для запиту: ${request_id}`);
    
    if (status === "COMPLETED") {
        resultsStore[request_id] = payload; // Зберігаємо результат
    }
    res.status(200).send("OK");
});

// 3. Локальний чек (браузер питає Твій сервер, а не API Fal)
app.get('/check/:id', (req, res) => {
    const result = resultsStore[req.params.id];
    if (result) {
        res.json(result);
    } else {
        res.status(202).json({ status: "processing" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Сервер на Webhooks працює на порту ${PORT}`));