const express = require('express');
const cors = require('cors');
const fs = require('fs')
const https = require('https')
const { execSync: exec } = require('child_process')
const { Deepgram } = require('@deepgram/sdk')
const ffmpegStatic = require('ffmpeg-static')
const dotenv = require('dotenv');
const { upload, s3 } = require('./middleware/multer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const deepgram = new Deepgram(process.env.CHROME_EXTENSION_PROJECT)

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function ffmpeg(command) {
   return new Promise((resolve, reject) => {
     exec(`"${ffmpegStatic}" ${command}`, (err, stderr, stdout) => {
       if (err) reject(err);
       resolve(stdout);
     });
   });
}
 

async function transcribeLocalVideo(filePath) {
   ffmpeg(`-hide_banner -y -i "${filePath}" "${filePath}.wav"`);
 
   const audioFile = {
     buffer: fs.readFileSync(`${filePath}.wav`),
     mimetype: 'audio/wav',
   };
   const response = await deepgram.transcription.preRecorded(audioFile, {
     punctuation: true,
   });
   return response.results;
}
 

async function downloadFile(url) {
   return new Promise((resolve, reject) => {
      const request = https.get(url, (response) => {
         const fileName = url.split('/').slice(-1)[0] // Get the final part of the URL only
         const fileStream = fs.createWriteStream(fileName)
         response.pipe(fileStream)
         response.on('end', () => {
         fileStream.close()
         resolve(fileName)
         })
      })
   })
}

app.post('/upload', upload.array('video', 10), async (req, res) => {
   try {
      if (!req.files || req.files.length === 0) {
         return res.status(400).json({ error: 'Please select a video file' });
      }

      const file = req.files[0]; 
      const uploadParams = {
         Bucket: process.env.AWS_BUCKET_NAME,
         Key: `${Date.now()}-${file.originalname}`,
         Body: file.buffer,
         ContentType: file.mimetype,
      };

      const result = await s3.upload(uploadParams).promise();
      // const transcription = await transcribeVideo(file.buffer);
      const filePath = await downloadFile(result.Location)
      const transcription = await transcribeLocalVideo(filePath)
      console.dir(transcription, { depth: null })

      const videoKey = result.Key;
      const videoStream = s3.getObject({
         Bucket: process.env.AWS_BUCKET_NAME,
         Key: videoKey,
      }).createReadStream();

      videoStream.pipe(res);


      // Get page to render with video player and transcription
      const videoPlayer = `
         <video controls width="500">
         <source src="${result.Key}" type="video/mp4">
         Your browser does not support the video tag.
         </video>
      `;

      const transcriptionSection = `
         <div>
         <h3>Transcription:</h3>
         <p>${transcription}</p>
         </div>
      `;

      res.send(result.Key, result.Location, videoPlayer + transcriptionSection);
   } catch (error) {
      console.error('Error handling video upload:', error);
      res.status(500).json({
         success: false, errorMessage:'Internal Server Error'
      });
   }
});

app.get('/videos/:key', async (req, res) => {
   const videoKey = req.params.key;
   try {
      const downloadParams = {
         Bucket: process.env.AWS_BUCKET_NAME,
         Key: videoKey,
      };
      const objectData = await s3.getObject(downloadParams).promise();
      const videoBuffer = objectData.Body;

      const contentType = objectData.ContentType;
      res.set('Content-Type', contentType);

      res.send(videoBuffer);
   } catch (error) {
      return res.status(500).json({
         success: false,
         message: 'Unable to get video',
         error: error.message,
      });
   }
});

app.listen(PORT, () => {
   console.log(`Server is running on http://localhost:${PORT}`);
});
