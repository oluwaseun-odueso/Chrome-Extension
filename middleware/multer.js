const multer = require('multer');
const { S3 } = require('aws-sdk');
const dotenv = require('dotenv');

dotenv.config();


// Set up multer to handle file uploads
const upload = multer({
      storage: multer.memoryStorage(),
      limits: {
         fileSize: 10 * 1024 * 1024, // 10 MB
      },
      fileFilter: (req, file, cb) => {
         const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif'];
         if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
         } else {
            cb(new Error('Invalid file type.'));
         }
      },
   });

// Set up an Amazon S3 client
const s3 = new S3({
   accessKeyId: process.env.AWS_ACCESS_KEY,
   secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

module.exports = { upload, s3}