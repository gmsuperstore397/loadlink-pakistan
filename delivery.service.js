const crypto = require('crypto');

async function sendEmail(to, subject, text) {
  if (!to) return false;

  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      auth: {
        user: process.env.GMAIL_USER,
        pass: String(process.env.GMAIL_APP_PASSWORD).replace(/\s+/g, ''),
      },
    });
    const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
    try {
      await transporter.sendMail({ from, to, subject, text });
      return true;
    } catch (error) {
      console.error('Gmail email delivery failed:', error.message);
      return false;
    }
  }

  if (!process.env.RESEND_API_KEY) return false;
  const from = process.env.EMAIL_FROM || 'LoadLink Pakistan <onboarding@resend.dev>';
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    });
    return resp.ok;
  } catch (error) {
    console.error('Resend email delivery failed:', error.message);
    return false;
  }
}

function normalizePhone(to) {
  const value = String(to || '').replace(/\s+/g, '');
  if (value.startsWith('03')) return '+92' + value.slice(1);
  return value;
}

async function sendSms(to, message) {
  to = normalizePhone(to);
  if (!to || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM) return false;
  const body = new URLSearchParams({ To: to, From: process.env.TWILIO_FROM, Body: message });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return resp.ok;
}

async function sendWhatsApp(to, message) {
  to = normalizePhone(to);
  if (!to || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_WHATSAPP_FROM) return false;
  const body = new URLSearchParams({ To: `whatsapp:${to}`, From: process.env.TWILIO_WHATSAPP_FROM, Body: message });
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
  const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  return resp.ok;
}

function randomToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function sendOtpEmail(to, code) {
  if (!to) return false;
  const subject = 'LoadLink Pakistan - Email Verification OTP';
  const text = `Aapka LoadLink Pakistan verification code: ${code}. Ye code 10 minutes tak valid hai.`;
  return sendEmail(to, subject, text);
}

module.exports = { sendEmail, sendSms, sendWhatsApp, randomToken, hashToken, sendOtpEmail };
