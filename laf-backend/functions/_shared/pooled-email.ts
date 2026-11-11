import { readFile } from 'node:fs/promises';

// The template's own attachment paths become bytes before crossing the sending boundary.
export async function sendThroughMailPool(to: string, mail: any, idempotencyKey: string) {
  try {
    const attachments = await Promise.all(
      (mail.attachments || []).map(async (a) => ({
        filename: a.filename,
        content: (a.content == null ? await readFile(a.path) : Buffer.from(a.content)).toString('base64'),
        cid: a.cid,
        contentType: a.contentType
      }))
    );
    const response = await fetch(process.env.MAIL_POOL_URL.replace(/\/$/, '') + '/mail-pool', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mail-product': 'yozi',
        'x-mail-secret': process.env.MAIL_POOL_SECRET || ''
      },
      body: JSON.stringify({
        to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        idempotencyKey,
        attachments
      }),
      signal: AbortSignal.timeout(45000)
    });
    const result = await response.json();
    if (response.ok && ['sent', 'failed', 'uncertain'].includes(result.status)) return result;
    return { status: response.status >= 500 ? 'uncertain' : 'failed', reason: 'mail_pool_unavailable' };
  } catch {
    return { status: 'uncertain', reason: 'mail_pool_unavailable' };
  }
}
