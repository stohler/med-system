const nodemailer = require("nodemailer");
const { env } = require("../config/env");

let transporter;

function getTransporter() {
  if (transporter) return transporter;

  if (env.smtpService) {
    transporter = nodemailer.createTransport({
      service: env.smtpService,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
    return transporter;
  }

  if (env.smtpHost && env.smtpUser && env.smtpPass) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpPort === 465,
      auth: { user: env.smtpUser, pass: env.smtpPass },
    });
    return transporter;
  }

  transporter = nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

async function sendMail({ to, subject, text, html, attachments = [] }) {
  if (!to) return null;
  const mailTransport = getTransporter();
  return mailTransport.sendMail({
    from: env.smtpFrom,
    to,
    subject,
    text,
    html,
    attachments,
  });
}

module.exports = { sendMail };
