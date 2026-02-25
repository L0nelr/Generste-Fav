const express = require('express');
const { fal } = require("@fal-ai/client");
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
// Бібліотека node-fetch більше не потрібна, Node 22 має нативний fetch!

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const videosDir = path.join(__dirname, 'public', 'videos');
if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

app.use(express.static('public'));

// БАЗОВІ ендпоінти, щоб уникнути помилок шляху
const MODEL_ENDPOINTS = {
    "kling": "fal-ai/kling-video/v1/pro", 
    "luma": "fal-ai/luma-dream-machine",
    "minimax-img": "fal-ai/minimax/video"
};

const jobStates = {};

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

// Функція унікалізації
async function randomizeVideo(inputPath, platform) {
    const outputFileName = `${platform}_${Date.now()}_${Math.floor(Math.random() * 1000)}.mp4`;
    const outputPath = path.join(videosDir, outputFileName);

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
                `-b:v ${bitrate}k`,
                `-metadata creation_time="${randomDate}"`,
                `-map_metadata -1` 
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

        if (!image_url) return res.status(400).json({ error: "Потрібне зображення" });

        const { request_id } = await fal.queue.submit(endpoint, {
            input: { prompt: prompt || "cinematic scene", image_url: image_url }
        });
        
        jobStates[request_id] = { status: 'generating' };
        res.json({ request_id, endpoint }); 
    } catch (error) {
        console.error("❌ Помилка Start:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/status', async (req, res) => {
    try {
        const { request_id, endpoint } = req.body;
        if (!request_id || !endpoint) return res.status(400).json({ error: "Бракує даних" });

        const job = jobStates[request_id];
        
        // Перехоплення помилок унікалізації
        if (job?.status === 'error') {
            return res.status(500).json({ error: `Помилка унікалізації FFmpeg: ${job.errorMsg}` });
        }

        if (job?.status === 'done') {
            return res.json({ status: 'COMPLETED', videos: job.videos });
        }

        if (job?.status === 'processing_ffmpeg') {
            return res.status(202).json({ status: "Унікалізація (FFmpeg)..." });
        }

        const statusUpdate = await fal.queue.status(endpoint, { requestId: request_id });

        // Захист від втрати стану (job?)
        if (statusUpdate.status === "COMPLETED" && job?.status === 'generating') {
            const result = await fal.queue.result(endpoint, { requestId: request_id });
            const sourceVideoUrl = result.data?.video?.url || result.video?.url || result.url;

            jobStates[request_id].status = 'processing_ffmpeg';
            
            setTimeout(async () => {
                try {
                    // Використовуємо нативний fetch замість node-fetch
                    const response = await fetch(sourceVideoUrl);
                    const arrayBuffer = await response.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    
                    const tempInputPath = path.join(videosDir, `temp_${request_id}.mp4`);
                    fs.writeFileSync(tempInputPath, buffer);

                    const [tiktokUrl, instaUrl, ytUrl] = await Promise.all([
                        randomizeVideo(tempInputPath, 'tiktok'),
                        randomizeVideo(tempInputPath, 'insta'),
                        randomizeVideo(tempInputPath, 'youtube')
                    ]);

                    fs.unlinkSync(tempInputPath);

                    jobStates[request_id] = { 
                        status: 'done', 
                        videos: { tiktok: tiktokUrl, insta: instaUrl, youtube: ytUrl } 
                    };
                } catch (err) {
                    console.error("❌ FFmpeg помилка:", err);
                    jobStates[request_id] = { status: 'error', errorMsg: err.message };
                }
            }, 0);

            return res.status(202).json({ status: "Завантаження та запуск FFmpeg..." });
        }
        
        res.status(202).json({ status: statusUpdate.status });
    } catch (error) {
        console.error(`❌ Помилка Status:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Сервер з FFmpeg запущено на порту ${PORT}`));