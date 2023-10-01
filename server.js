const express = require('express');
const cors = require('cors');
const { SpeechClient } = require('@google-cloud/speech');
const dotenv = require('dotenv');
const { upload, s3 } = require('./middleware/multer');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const speechClient = new SpeechClient();

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

async function transcribeVideo(buffer) {
  const audioBytes = buffer.toString('base64');
  const audio = { content: audioBytes };

  const config = {
    encoding: 'LINEAR16',
    sampleRateHertz: 16000,
    languageCode: 'en-US',
  };

  const request = { audio, config };

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

app.post('/upload', upload.array('video', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Please select a video file' });
    }

    const file = req.files[0]; // Assuming you want to process the first file if there are multiple

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${Date.now()}-${file.originalname}`,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    const result = await s3.upload(uploadParams).promise();

    const transcription = await transcribeVideo(file.buffer);

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

    res.send(result.Key, videoPlayer + transcriptionSection);
  } catch (error) {
    console.error('Error handling video upload:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.use('/videos/:key', async (req, res) => {
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
