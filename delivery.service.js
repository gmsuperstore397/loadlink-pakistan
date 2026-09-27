const crypto = require('crypto');

async function sendEmail(to, subject, text) {
  if (!to || !process.env.RESEND_API_KEY) return false;
  const from = process.env.EMAIL_FROM || 'LoadLink Pakistan <onboarding@resend.dev>';
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], subject, text }),
  });
  return resp.ok;
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

module.exports = { sendEmail, sendSms, sendWhatsApp, randomToken, hashToken };

async function sendOtpSms(to, code) {
  return sendSms(to, `LoadLink Pakistan verification code: ${code}. Ye code 10 minutes tak valid hai.`);
}

module.exports.sendOtpSms = sendOtpSms;
