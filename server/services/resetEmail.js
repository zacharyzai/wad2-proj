// The "reset your password" email, in the account's language (English when it has none). Plain words, one big button,
// the time limit, and what to do if they didn't ask. Plain text and HTML say the same thing.
// shortcut: Chinese, Malay and Tamil to be checked by native speakers, like the app's own translations.
const TEXT = {
  en: {
    subject: 'Reset your Ah Ma Ah Gong Can password',
    hello: (name) => (name ? `Hello ${name},` : 'Hello,'),
    body: 'Someone asked to reset the password for your Ah Ma Ah Gong Can account. To choose a new password, press the button below.',
    button: 'Choose a new password',
    expiry: 'This link works for 30 minutes, and only once.',
    ignore: 'If you did not ask for this, you can ignore this email. Your password stays the same.',
    copy: 'If the button does not work, copy this link into your browser:',
  },
  zh: {
    subject: '重设您的 Ah Ma Ah Gong Can 密码',
    hello: (name) => (name ? `${name}，您好：` : '您好：'),
    body: '有人请求重设您 Ah Ma Ah Gong Can 账户的密码。要设定新密码，请按下面的按钮。',
    button: '设定新密码',
    expiry: '这个链接在 30 分钟内有效，而且只能使用一次。',
    ignore: '如果这不是您的请求，请不用理会这封电子邮件。您的密码不会改变。',
    copy: '如果按钮不能用，请把这个链接复制到浏览器：',
  },
  ms: {
    subject: 'Tetapkan semula kata laluan Ah Ma Ah Gong Can anda',
    hello: (name) => (name ? `Hai ${name},` : 'Hai,'),
    body: 'Seseorang meminta untuk menetapkan semula kata laluan akaun Ah Ma Ah Gong Can anda. Untuk memilih kata laluan baharu, tekan butang di bawah.',
    button: 'Pilih kata laluan baharu',
    expiry: 'Pautan ini boleh digunakan selama 30 minit, dan sekali sahaja.',
    ignore: 'Jika anda tidak meminta ini, abaikan e-mel ini. Kata laluan anda tidak berubah.',
    copy: 'Jika butang tidak berfungsi, salin pautan ini ke dalam pelayar anda:',
  },
  ta: {
    subject: 'உங்கள் Ah Ma Ah Gong Can கடவுச்சொல்லை மாற்றுங்கள்',
    hello: (name) => (name ? `வணக்கம் ${name},` : 'வணக்கம்,'),
    body: 'உங்கள் Ah Ma Ah Gong Can கணக்கின் கடவுச்சொல்லை மாற்ற யாரோ கேட்டுள்ளனர். புதிய கடவுச்சொல்லைத் தேர்ந்தெடுக்க, கீழே உள்ள பொத்தானை அழுத்துங்கள்.',
    button: 'புதிய கடவுச்சொல்லைத் தேர்ந்தெடுங்கள்',
    expiry: 'இந்த இணைப்பு 30 நிமிடங்களுக்கு, ஒரு முறை மட்டுமே வேலை செய்யும்.',
    ignore: 'நீங்கள் இதைக் கேட்கவில்லை என்றால், இந்த மின்னஞ்சலைப் புறக்கணியுங்கள். உங்கள் கடவுச்சொல் மாறாது.',
    copy: 'பொத்தான் வேலை செய்யவில்லை என்றால், இந்த இணைப்பை உங்கள் உலாவியில் நகலெடுத்து ஒட்டுங்கள்:',
  },
}

const escape = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// { subject, text, html } for one account. `link` comes from resetLink() (services/mail.js), never from the request.
export function resetEmail({ name, language, link }) {
  const lang = Object.hasOwn(TEXT, language) ? language : 'en'
  const t = TEXT[lang]
  const hello = t.hello(typeof name === 'string' ? name.trim() : '')
  const text = [hello, '', t.body, '', `${t.button}: ${link}`, '', t.expiry, t.ignore].join('\n')
  // Big type and a big button (older readers); inline styles because email apps drop <style>. Teal on white: 5.9:1.
  const p = 'margin:0 0 16px;font-size:18px;line-height:1.55;color:#211e1a'
  const html = `<!doctype html><html lang="${lang}"><body style="margin:0;padding:24px;background:#faf7f2;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:28px;background:#ffffff;border-radius:16px">
<p style="${p}">${escape(hello)}</p>
<p style="${p}">${escape(t.body)}</p>
<p style="margin:24px 0"><a href="${escape(link)}" style="display:inline-block;padding:16px 28px;border-radius:999px;background:#1a7070;color:#ffffff;font-size:20px;font-weight:bold;text-decoration:none">${escape(t.button)}</a></p>
<p style="${p}"><strong>${escape(t.expiry)}</strong></p>
<p style="${p}">${escape(t.ignore)}</p>
<p style="margin:24px 0 0;font-size:15px;line-height:1.5;color:#5e574e">${escape(t.copy)}<br><a href="${escape(link)}" style="color:#1a5490;word-break:break-all">${escape(link)}</a></p>
</div></body></html>`
  return { subject: t.subject, text, html }
}
