// === БЛОК 1: ІМПОРТИ ТА НАЛАШТУВАННЯ ===
const express = require('express');
const { fal } = require("@fal-ai/client");
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Вказуємо FFmpeg, де лежить його ядро
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
// Збільшуємо ліміти для передачі великих фотографій у Base64
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Створюємо папку для збереження готових відео, якщо її немає
const videosDir = path.join(__dirname, 'public', 'videos');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

// Відкриваємо публічний доступ до папки public (щоб сайт міг завантажити відео)
app.use(express.static('public'));

// === БЛОК 2: СЛОВНИК МОДЕЛЕЙ (МАРШРУТИЗАТОР) ===
const MODEL_ENDPOINTS = {
    // Вказуємо конкретні версії моделей, щоб уникнути помилок deprecated
    "kling": "fal-ai/kling-video/v1.5/pro/image-to-video", // Оновлено до 1.5 для кращої стабільності
    "luma": "fal-ai/luma-dream-machine/ray-2",             // Перехід на актуальну архітектуру Ray 2
    "minimax-img": "fal-ai/minimax/video-01/image-to-video"
};
// Тут сервер "пам'ятає", на якій стадії знаходиться кожне відео
const jobStates = {};

// === БЛОК 3: ДВИГУН УНІКАЛІЗАЦІЇ (FFMPEG) ===
function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

async function randomizeVideo(inputPath, platform) {
    const outputFileName = `${platform}_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp4`;
    const outputPath = path.join(videosDir, outputFileName);

    // Генеруємо випадкові параметри для обману алгоритмів
    const brightness = getRandom(-0.02, 0.02).toFixed(3);
    const contrast = getRandom(0.98, 1.02).toFixed(3);
    const saturation = getRandom(0.98, 1.02).toFixed(3);
    const cropPixels = Math.floor(getRandom(1, 4)); 
    const bitrate = Math.floor(getRandom(4000, 5000));
    const randomDate = new Date(Date.now() - Math.random() * 10000000000).toISOString();

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoFilters([
                `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
                `crop=iw-${cropPixels}:ih-${cropPixels}`
            ])
            .outputOptions([
                `-b:v ${bitrate}k`, // Випадковий бітрейт
                `-metadata creation_time="${randomDate}"`, // Випадковий час створення
                `-map_metadata -1` // Видалення старого цифрового сліду
            ])
            .save(outputPath)
            .on('end', () => resolve(`/videos/${outputFileName}`))
            .on('error', (err) => reject(err));
    });
}

// === БЛОК 4: API ЗАПУСКУ (/start) — ОНОВЛЕНО: СТРОГІ МЕЖІ ТА УНІКАЛІЗАЦІЯ ===
app.post('/start', async (req, res) => {
    try {
        const { image_url, prompt, model_id, aspect_ratio, loop_video } = req.body;
        const endpoint = MODEL_ENDPOINTS[model_id] || MODEL_ENDPOINTS["kling"];

        if (!image_url) return res.status(400).json({ error: "Потрібне зображення для стартового кадру" });

        let finalImageUrl = image_url;

        // 1. Оптимізація завантаження (Base64 -> Fal Cloud)
        if (image_url.startsWith('data:image')) {
            console.log("☁️ Завантаження фото у хмару Fal для стабільності...");
            const matches = image_url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                const uploadResult = await fal.storage.upload(buffer);
                finalImageUrl = uploadResult.url;
            }
        } 

        // 2. СИСТЕМА НЕГАТИВНИХ ПРОМПТІВ (Профілактика деформацій та мила)
        // Ці параметри жорстко відсікають артефакти нейромереж [cite: 84]
        const negative_prompt = "blurry, distorted, low quality, morphing, flickering, out of focus, deformed objects, messy textures, overexposed, grainy (except for CCTV), low resolution, extra limbs, unnatural movement";

        // 3. МОДИФІКАЦІЯ ПРОМПТУ (Додавання строгих меж стилю та камери)
        // Ми вшиваємо технічні параметри прямо в запит для максимальної якості
        const enhancedPrompt = `
            ${prompt}. 
            Style: Hyper-realistic with high color saturation. 
            Camera: Locked steady shot, extreme macro focus on details. 
            Quality: 4k cinematic render, zero motion blur, consistent light reflections.
        `.trim();

        console.log(`🚀 Запуск ${model_id} | Формат: ${aspect_ratio || "9:16"} | Loop: ${loop_video}`);

        // 4. ФОРМУВАННЯ ПАРАМЕТРІВ ПІД КОНКРЕТНУ МОДЕЛЬ
        const payloadInput = { 
            prompt: enhancedPrompt, 
            image_url: finalImageUrl,
            aspect_ratio: aspect_ratio || "9:16",
            expand_prompt: false // Вимикаємо, щоб не переплачувати та не втрачати контроль над промптом [cite: 13, 105]
        };

        // Логіка для Luma (Ray-2): ідеально для ASMR та діорам [cite: 14, 18, 78]
        if (model_id === "luma") {
            payloadInput.loop = loop_video || false; // Безшовне зациклення підтримується тут [cite: 16, 67]
            payloadInput.negative_prompt = negative_prompt;
        } 
        
        // Логіка для Kling: найкраща фізика та консистентність [cite: 10, 12, 51]
        if (model_id === "kling") {
            // Kling не підтримує параметр 'loop', його надсилання викликає Bad Request
            payloadInput.mode = "pro"; // Використовуємо Pro режим для якісної фізики [cite: 10]
            // Для Kling ми додаємо негативні вказівки прямо в основний промпт, якщо модель не має окремого поля
            payloadInput.prompt += ` [Negative: ${negative_prompt}]`;
        }

        // 5. ВІДПРАВКА ЗАПИТУ
        const { request_id } = await fal.queue.submit(endpoint, {
            input: payloadInput
        });
        
        jobStates[request_id] = { status: 'generating' };
        res.json({ request_id, endpoint }); 
    } catch (error) {
        console.error("❌ Помилка Start:", error.message);
        res.status(500).json({ error: error.message || "Помилка при запуску генерації" });
    }
});

// === БЛОК 5: API СТАТУСУ (/status) ===
app.post('/status', async (req, res) => {
    try {
        const { request_id, endpoint } = req.body;
        if (!request_id || !endpoint) return res.status(400).json({ error: "Бракує даних" });

        const statusUpdate = await fal.queue.status(endpoint, { requestId: request_id });

        if (statusUpdate.status === "COMPLETED") {
            const result = await fal.queue.result(endpoint, { requestId: request_id });
            const sourceVideoUrl = result.data?.video?.url || result.video?.url || result.url;
            
            // Повертаємо ОДНЕ готове відео
            return res.json({ status: 'COMPLETED', video_url: sourceVideoUrl });
        }
        
        res.status(202).json({ status: statusUpdate.status });
    } catch (error) {
        console.error(`❌ Помилка Status:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

/// === БЛОК 6: РУЧНА УНІКАЛІЗАЦІЯ (/uniqueize) ===
app.post('/uniqueize', async (req, res) => {
    try {
        const { video_url } = req.body;
        if (!video_url) return res.status(400).json({ error: "Немає посилання на відео" });

        console.log("✂️ Запуск ручної унікалізації FFmpeg...");

        // Завантажуємо оригінал
        const response = await fetch(video_url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        const tempInputPath = path.join(videosDir, `temp_manual_${Date.now()}.mp4`);
        fs.writeFileSync(tempInputPath, buffer);

        // Робимо 3 версії паралельно
        const [tiktokUrl, instaUrl, ytUrl] = await Promise.all([
            randomizeVideo(tempInputPath, 'tiktok'),
            randomizeVideo(tempInputPath, 'insta'),
            randomizeVideo(tempInputPath, 'youtube')
        ]);

        fs.unlinkSync(tempInputPath); // Видаляємо оригінал з сервера

        res.json({ tiktok: tiktokUrl, insta: instaUrl, youtube: ytUrl });
    } catch (error) {
        console.error("❌ Помилка FFmpeg:", error.message);
        res.status(500).json({ error: "Помилка при створенні копій: " + error.message });
    }
});

// === ЗАПУСК СЕРВЕРА ===
const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Сервер з FFmpeg запущено на порту ${PORT}`));

