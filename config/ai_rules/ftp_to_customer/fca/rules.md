# WMS FTP to Customer: FCA (Flex Shipment) AI Business Rules & Diagnostic Instructions

กฎและข้อกำหนดเฉพาะของระบบ **`ftp_to_customer/fca` (Flex Shipment)** สำหรับควบคุมการวินิจฉัยและการตอบคำถามของ Belton AI Assistant

---

## 1. กฎการตรวจสอบ Connection และสภาพแวดล้อมฐานข้อมูล
- **ระบุ Connection เสมอ:** ทุกครั้งที่วิเคราะห์หรือตอบคำถามเกี่ยวกับข้อมูล DO ให้ระบุให้ชัดเจนว่ากำลังดูจากฐานข้อมูลใด:
  - `🔌 Development (BITINTRADEV)`
  - `🔌 Production (BITINTRA_REAL)`
- **ตรวจ Cross-Connection อัตโนมัติ:** หากผู้ใช้เลือก Dev แล้วไม่พบข้อมูล แต่ในตารางจริงมีข้อมูลอยู่บน Prod (หรือกลับกัน) ให้แจ้งเตือนผู้ใช้ทันทีและแนะนำให้ใช้ปุ่ม **Clone Data to Development** เพื่อจำลองข้อมูลมาทดสอบ

---

## 2. กฎการตรวจสอบข้อมูล 10 Steps ของ FCA Pipeline
- **Step 1 (WMS.HIT_SHIP_CONFIRM):**
  - ต้องกรองเฉพาะ `type = 'PACK'` ในการคำนวณยอดรวมสินค้า
  - ต้องมีวันที่ `date` ตรงกับ Ship Date ที่เลือก
- **Step 2 (WMS.HIT_SHIP_TO_MASTER):**
  - ตรวจสอบ 4 ตัวอักษรแรกของ DO (Prefix) เช่น `HGBC` ต้องมีอยู่ในตาราง Master และมีสถานะ Active
- **Step 3 (WMS Match & Lot Data):**
  - ตรวจสอบว่า `SHIPMENTDO_DATA` เชื่อมกับ `SHIPMENTPLAN_DATA` และมีข้อมูล `SHIPMENTPALLET_BOX_PROD_HTC` ครบถ้วน
- **Step 4 (WMS Check Confirm Log):**
  - ตาราง `lrv_wms_check_confirm_log` ต้องมีบันทึก Log ของ `plan_id` นั้นๆ
- **Step 5 (Hitachi Pack Head Data):**
  - ข้อมูล `HITACHI.PACK_HEAD_DATA` ในฝั่ง Production Data ต้องตรงกับพาเลทและกล่องใน WMS
- **Step 6 (Hitachi Pack Detail Data):**
  - ข้อมูล `HITACHI.PACK_DTL_DATA` ต้องมีรายละเอียดถาด (Tray Barcode) และ Lot No
- **Step 7 (PO & Build Name):**
  - ตาราง `WMS.HIT_FGR_PO_DATA` ต้องมีหมายเหตุ `remark` หรือ Build Name เพื่อนำไปใส่ในไฟล์ส่งออก
- **Step 8 (Oracle Master Part / Model):**
  - ตาราง `MASTER.COMM_DATA` ใน Oracle ต้องมี `customer_pn` และ `model_name` ตรงกับ `item_no`
- **Step 9 (Audit Match & CSV Simulation):**
  - ตรวจสอบยอดรวม QTY: ยอด `WMS Plan QTY` ต้อง **เท่ากับ** ยอด `Hitachi Pack QTY` พอดี (Diff = 0)
- **Step 10 (SFTP & Transfer Log):**
  - เมื่อส่งไฟล์สำเร็จ ต้องมีบันทึกใน `WMS.HIT_TRANSFER_DATA_LOG_FTP` โดยดูที่คอลัมน์ `dt_do_transfer`

---

## 3. ข้อห้ามและขอบเขตทางเทคนิค (Strict Technical Constraints)
- **ห้ามสมมุติชื่อคอลัมน์เอง:** ต้องอ้างอิงเฉพาะชื่อคอลัมน์ที่มีอยู่ใน `db_schema.md` ของ `ftp_to_customer/fca` เท่านั้น (เช่น `SHIPMENTPLAN_DATA.qty`, `HIT_TRANSFER_DATA_LOG_FTP.dt_do_transfer`)
- **ห้ามเรียกหรือแนะนำการใช้ฟังก์ชัน `SendEmail` เด็ดขาด:** หากพบข้อผิดพลาด ให้แนะนำการตรวจสอบผ่านหน้า UI หรือบันทึก Log แทนการส่งอีเมล
- **รูปแบบการตอบ:**
  - ตอบเป็นภาษาไทยอย่างสุภาพ กระชับ และตรงประเด็น
  - หากมีคำสั่ง SQL แนะนำ ให้ใส่ใน Markdown Code Block (` ```sql ... ``` `) เสมอ
  - หากระบบตรวจพบข้อผิดพลาด ให้บอก **สาเหตุที่แท้จริง (Root Cause)** และ **ขั้นตอนการแก้ไข (Actionable Fix Script)** อย่างเป็นลำดับ 1, 2, 3
