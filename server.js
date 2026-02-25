const express = require('express');
const { fal } = require("@fal-ai/client");
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const fetch = require('node-fetch');

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Створюємо папку для збереження готових відео
const videosDir = path.join(__dirname, 'public', 'videos');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

app.use(express.static('public'));

const MODEL_ENDPOINTS = {
    "kling": "fal-ai/kling-video/v1/pro/image-to-video",
    "luma": "fal-ai/luma-dream-machine/image-to-video",
    "minimax-img": "fal-ai/minimax/video/image-to-video"
};

// Зберігаємо стан обробки, щоб уникнути конфліктів та 500 помилок
const jobStates = {};

// Функція для генерації випадкових чисел у діапазоні
function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

// Процесор унікалізації (FFmpeg)
async function randomizeVideo(inputPath, platform) {
    const outputFileName = `${platform}_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp4`;
    const outputPath = path.join(videosDir, outputFileName);

    // Рандомні параметри унікалізації
    const brightness = getRandom(-0.02, 0.02).toFixed(3);
    const contrast = getRandom(0.98, 1.02).toFixed(3);
    const saturation = getRandom(0.98, 1.02).toFixed(3);
    const cropPixels = Math.floor(getRandom(1, 4)); 
    const bitrate = Math.floor(getRandom(4000, 5000));
    
    // Випадкова дата в минулому (для метаданих)
    const randomDate = new Date(Date.now() - Math.random() * 10000000000).toISOString();

    return new Promise((resolve, reject) => {
        ffmpeg(inputPath)
            .videoFilters([
                `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}`,
                `crop=iw-${cropPixels}:ih-${cropPixels}`
            ])
            .outputOptions([
                `-b:v ${bitrate}k`,
                `-metadata creation_time="${randomDate}"`,
                `-map_metadata -1` // Видалення оригінальних метаданих
            ])
            .save(outputPath)
            .on('end', () => resolve(`/videos/${outputFileName}`))
            .on('error', (err) => reject(err));
    });
}

app.post('/start', async (req, res) => {
    try {
        const { image_url, prompt, model_id } = req.body;
        const endpoint = MODEL_ENDPOINTS[model_id] || MODEL_ENDPOINTS["kling"];

        if (!image_url) return res.status(400).json({ error: "Потрібне зображення (Nano Banana)" });

        const { request_id } = await fal.queue.submit(endpoint, {
            input: { prompt: prompt || "cinematic scene", image_url: image_url }
        });
        
        jobStates[request_id] = { status: 'generating' };
        res.json({ request_id, endpoint }); 
    } catch (error) {
        console.error("Помилка Start:", error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/status', async (req, res) => {
    try {
        const { request_id, endpoint } = req.body;
        if (!request_id || !endpoint) return res.status(400).json({ error: "Бракує даних" });

        const job = jobStates[request_id];
        
        // Якщо відео вже унікалізовано і готове
        if (job && job.status === 'done') {
            return res.json({ status: 'COMPLETED', videos: job.videos });
        }

        // Якщо відбувається процес роботи FFmpeg (щоб не перезапускати)
        if (job && job.status === 'processing_ffmpeg') {
            return res.status(202).json({ status: "Унікалізація (FFmpeg)..." });
        }

        const statusUpdate = await fal.queue.status(endpoint, { requestId: request_id });

        if (statusUpdate.status === "COMPLETED" && job.status === 'generating') {
            const result = await fal.queue.result(endpoint, { requestId: request_id });
            const sourceVideoUrl = result.data?.video?.url || result.video?.url || result.url;

            // Блокуємо повторний запуск
            jobStates[request_id].status = 'processing_ffmpeg';
            
            // Завантажуємо оригінал і запускаємо унікалізацію асинхронно
            setTimeout(async () => {
                try {
                    const response = await fetch(sourceVideoUrl);
                    const buffer = await response.buffer();
                    const tempInputPath = path.join(videosDir, `temp_${request_id}.mp4`);
                    fs.writeFileSync(tempInputPath, buffer);

                    // Створюємо 3 версії паралельно
                    const [tiktokUrl, instaUrl, ytUrl] = await Promise.all([
                        randomizeVideo(tempInputPath, 'tiktok'),
                        randomizeVideo(tempInputPath, 'insta'),
                        randomizeVideo(tempInputPath, 'youtube')
                    ]);

                    // Видаляємо тимчасовий оригінал
                    fs.unlinkSync(tempInputPath);

                    jobStates[request_id] = { 
                        status: 'done', 
                        videos: { tiktok: tiktokUrl, insta: instaUrl, youtube: ytUrl } 
                    };
                } catch (err) {
                    console.error("FFmpeg помилка:", err);
                    jobStates[request_id] = { status: 'error' };
                }
            }, 0);

            return res.status(202).json({ status: "Завантаження та запуск FFmpeg..." });
        }
        
        res.status(202).json({ status: statusUpdate.status });
    } catch (error) {
        console.error(`Помилка Status:`, error);
        res.status(500).json({ error: "Внутрішня помилка сервера при опитуванні" });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Сервер з FFmpeg запущено на порту ${PORT}`));