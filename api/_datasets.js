// ชุดข้อมูลที่ API รับ (ไฟล์ขึ้นต้นด้วย _ จึงไม่ใช่ endpoint บน Vercel)
// เพิ่มชุดข้อมูลใหม่: เพิ่มที่นี่ และที่ DATASETS ใน dashboards/shared/csv.js ให้ id ตรงกัน
//   headerFirstColumn  ช่องแรกของแถวหัวคอลัมน์ ใช้กันไฟล์ผิดชนิดถูกแชร์ทับ
export const DATASETS = {
  report:   { headerFirstColumn: 'province' }, // รายงานจำนวนคำร้องและความเสียหาย
  vulnerable: { headerFirstColumn: 'เขตสุขภาพ' }, // รายงานการแจ้งตำแหน่งพิกัดกลุ่มเปราะบาง (ตาราง 13 เขตสุขภาพ)
};

// 'report' keeps the paths it had before datasets existed (latest.json, published/…), so its earlier shares stay.
export const blobPrefix = id => (id === 'report' ? '' : `datasets/${id}/`);

// ?dataset=… (missing = 'report') -> id, or null when it is not a known dataset
export function datasetFrom(req) {
  const id = req.query?.dataset ?? new URL(req.url, 'http://x').searchParams.get('dataset') ?? 'report';
  return Object.hasOwn(DATASETS, id) ? id : null;
}
