'use strict';
/**
 * 密码重置邮件发送。
 * 当前为“控制台输出”实现（开发联调用）；生产请配置 SMTP 后替换 sendMail 实现。
 * 注意：永远不要在 API 响应里返回重置 token。
 */
const config = require('../config');

async function sendPasswordResetEmail(toEmail, resetUrl) {
  if (config.SMTP_HOST) {
    // TODO: 接入真实 SMTP（nodemailer 等），此处保留扩展点
    console.log(`[mail] SMTP 未完整配置，跳过真实发送: ${toEmail}`);
  }
  console.log('================ 密码重置邮件 ================');
  console.log(`收件人: ${toEmail}`);
  console.log(`重置链接(30分钟有效): ${resetUrl}`);
  console.log('==============================================');
}

module.exports = { sendPasswordResetEmail };
