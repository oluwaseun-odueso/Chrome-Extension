const express = require('express');
const multer = require('multer');
const fs = require('fs');
// const ffmpeg = require('fluent-ffmpeg');
const speech = require('@google-cloud/speech');
const dotenv = require('dotenv');
const storage = multer.memoryStorage();
// const upload = multer({ storage: storage });
const { upload, s3 } = require('./middleware/multer')
const speechClient = new speech.SpeechClient();

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;


// TRANSCRIBE VIDEO
async function transcribeVideo(buffer) {
   const audioBytes = buffer.toString('base64');
   const audio = { content: audioBytes }

   const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 16000,
      languageCode: 'en-US'
   }

   const request = { audio, config }

   try {
      const [response] = await speechClient.recognize(request);
      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');
  
      return transcription; 
   } catch (error) {
   console.error('Error transcribing video:', error);
   throw error;
   }
}


// UPLOAD VIDEO TO S3 AND GET LINK
app.post('/upload', upload.array('video', 10), async (req, res) => {
   try {
      // const videoPath = './video/video.mp4';
      // fs.writeFileSync(videoPath, req.file.buffer);
      const file = req.file;
      if (!file) {
         res.status(400).json({ error: 'Please select a video file' });
         return;
      }
      
      // Save the video(s) to S3
      const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${Date.now()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
      };
      
      const result = await s3.upload(uploadParams).promise();
      
      const transcription = await transcribeVideo(req.file.buffer);
   
      // Get page to render with video player and transcription
      const videoPlayer = `
         <video controls width="500">
            <source src=`${result.Key}` type="video/mp4">
            Your browser does not support the video tag.
         </video>
      `;
   
      const transcriptionSection = `
         <div>
            <h3>Transcription:</h3>
            <p>${transcription}</p>
         </div>
      `;
      res.send(videoPlayer + transcriptionSection);
   } catch (error) {
      console.error('Error handling video upload:', error);
      res.status(500).send('Internal Server Error');
   }
});


// FETCH OR GET VIDEOS FROM S3
// app.use('/videos', express.static('path/to/save'));
app.use('/videos/:key', async (req, res) => {
   const imageKey = req.params.key;
   try {
      // Retrieve the image from S3
      const downloadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: imageKey,
      };
      const objectData = await s3.getObject(downloadParams).promise();
      const imageBuffer = objectData.Body;

      // Set the Content-Type header to the image's MIME type
      const contentType = objectData.ContentType;
      res.set('Content-Type', contentType);

      // Return the image
      res.send(imageBuffer);
   } catch (error) {
      return res.status(500).json({ 
         success: false, 
         message: 'Unable to get image',
         error: error.message
      });
   };
})

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});