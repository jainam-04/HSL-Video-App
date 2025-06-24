// server.js
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = 4000;

const uploadedVideos = [];

const videoSchema = new mongoose.Schema({
      video_id: String,
      file_name: String,
      uploaded_date: {
            type: Date,
            default: Date.now()
      }
});

const video = mongoose.model("Video", videoSchema);

// Storage config
const storage = multer.diskStorage({
      destination: 'uploads/',
      filename: (req, file, cb) => {
            cb(null, Date.now() + path.extname(file.originalname));
      }
});
const upload = multer({ storage });

// Serve static files
app.use('/hls', express.static(path.join(__dirname, 'hls')));
app.use(express.static(__dirname));
// app.use(express.static('public'));

// Upload route
app.post('/upload', upload.single('video'), (req, res) => {
      const inputFilePath = req.file.path;
      const videoId = path.basename(inputFilePath, path.extname(inputFilePath));
      const outputDir = path.join(__dirname, 'hls', videoId);
      fs.mkdirSync(outputDir, { recursive: true });

      const ffmpeg = spawn('ffmpeg', [
            '-i', inputFilePath,
            '-filter_complex',
            `[0:v]split=4[v1][v2][v3][v4];` +
            `[v1]scale=w=1920:h=1080[v1out];` +
            `[v2]scale=w=1280:h=720[v2out];` +
            `[v3]scale=w=854:h=480[v3out];` +
            `[v4]scale=w=640:h=360[v4out]`,
            '-map', '[v1out]', '-c:v:0', 'libx264', '-b:v:0', '5000k', '-maxrate:v:0', '5350k', '-bufsize:v:0', '7500k',
            '-map', '[v2out]', '-c:v:1', 'libx264', '-b:v:1', '2800k', '-maxrate:v:1', '2996k', '-bufsize:v:1', '4200k',
            '-map', '[v3out]', '-c:v:2', 'libx264', '-b:v:2', '1400k', '-maxrate:v:2', '1498k', '-bufsize:v:2', '2100k',
            '-map', '[v4out]', '-c:v:3', 'libx264', '-b:v:3', '800k', '-maxrate:v:3', '856k', '-bufsize:v:3', '1200k',
            '-map', 'a:0', '-c:a:0', 'aac', '-b:a:0', '192k', '-ac', '2',
            '-map', 'a:0', '-c:a:1', 'aac', '-b:a:1', '128k', '-ac', '2',
            '-map', 'a:0', '-c:a:2', 'aac', '-b:a:2', '96k', '-ac', '2',
            '-map', 'a:0', '-c:a:3', 'aac', '-b:a:3', '64k', '-ac', '2',
            '-f', 'hls',
            '-hls_time', '5',
            '-hls_playlist_type', 'vod',
            '-hls_flags', 'independent_segments',
            '-hls_segment_filename', `${outputDir}/stream_%v/data%03d.ts`,
            '-master_pl_name', 'master.m3u8',
            '-var_stream_map', 'v:0,a:0 v:1,a:1 v:2,a:2 v:3,a:3',
            `${outputDir}/stream_%v/playlist.m3u8`
      ]);

      ffmpeg.stderr.on('data', data => console.error(data.toString()));

      ffmpeg.on('close', code => {
            if (code === 0) {
                  const newVideo = new video({
                        video_id:videoId,
                        file_name: req.file.originalname
                  });
                  newVideo.save().then(() => res.redirect('/videos')).catch((err) => {
                        console.error(err);
                        res.status(500).send("Upload succeeded but database save failed!");
                  })
            } else {
                  res.status(500).send('Error occurred during video processing');
            }
      });
});

app.get('/videos', (req, res) => {
      video.find().sort({ uploaded_date: -1 }).then((videos) => {
            console.log(videos);
            const links = videos.map((v) => {
                 return `<li><a href="/video.html?video_id=${v.video_id}">${v.file_name}</a></li>`
            }).join("");
            res.send(`
                  <h1>Uploaded Videos</h1>
                  <ul>${links}</ul>
                  <a href="/">Upload Another Video</a>   
            `);
      }).catch((err) => {
            console.error(err);
            res.status(500).send("Error loading videos!");
      });
});


app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

mongoose.connect(process.env.MONGO_DB_URI).then(() => {
      console.log("MongoDB Connected!");
}).catch((err) => {
      console.error(err);
});