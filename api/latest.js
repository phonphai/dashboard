// GET /api/latest — ข้อมูลชุดล่าสุดที่ทีมกรมแชร์ ให้ทุก dashboard โหลดตอนเปิดหน้า
// -> { publishedAt, files: [{ name, text }] } หรือ 404 ถ้ายังไม่เคยแชร์ (หน้าเว็บจะใช้ไฟล์ใน data/ แทน)
import { get } from '@vercel/blob';

const readText = async (pathname, useCache) => {
  const blob = await get(pathname, { access: 'private', useCache });
  return blob?.stream ? new Response(blob.stream).text() : null;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store'); // errors and "not published yet" are never cached
  try {
    const pointer = await readText('latest.json', false); // bypass CDN: latest.json is overwritten on every publish
    if (!pointer) return res.status(404).json({ error: 'ยังไม่มีข้อมูลที่แชร์' });
    const { publishedAt, files } = JSON.parse(pointer);
    const texts = await Promise.all(files.map(f => readText(f.pathname, true))); // published files never change
    if (texts.some(t => t == null)) return res.status(500).json({ error: 'ไฟล์ที่แชร์ไม่ครบ' });
    // Vercel's CDN keeps this answer for 60 s, so viewers opening the page together cost one function call and
    // one Blob read instead of one each (keeps the Hobby quota safe). New publishes show up within a minute.
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    return res.status(200).json({ publishedAt, files: files.map((f, i) => ({ name: f.name, text: texts[i] })) });
  } catch (err) {
    console.error(err);
    return res.status(503).json({ error: 'อ่านข้อมูลที่แชร์ไม่ได้ (ตรวจการเชื่อม Blob store)' });
  }
}
