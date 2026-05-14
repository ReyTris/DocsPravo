/**
 * Транзакционная отправка email через SMTP (Unisender Go / Yandex 360).
 * В dev, если SMTP не настроен, письма логируются в консоль — это позволяет
 * тестировать восстановление пароля локально без реального почтового сервера.
 */

import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (cachedTransporter) return cachedTransporter;
  const e = env();
  if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASSWORD) return null;
  cachedTransporter = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASSWORD },
  });
  return cachedTransporter;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(msg: MailMessage): Promise<void> {
  const e = env();
  const transporter = getTransporter();
  if (!transporter) {
    // Dev-режим без SMTP: не падаем, чтобы не блокировать восстановление пароля
    // на локальной разработке. Письмо печатается в лог — токен можно скопировать.
    console.warn(
      `[mailer] SMTP не настроен — письмо для ${msg.to} только в лог:\n` +
        `Subject: ${msg.subject}\n${msg.text}`,
    );
    return;
  }
  await transporter.sendMail({
    from: e.SMTP_FROM,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });
}
