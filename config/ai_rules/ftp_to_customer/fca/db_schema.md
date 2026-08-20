# WMS FTP to Customer: FCA (Flex Shipment) Database Schema & Data Dictionary

เอกสารโครงสร้างฐานข้อมูลเฉพาะระบบ **`ftp_to_customer/fca` (Flex Shipment - Z0005 / S0005)** สำหรับให้ AI ใช้เป็น Ground Truth ในการวิเคราะห์และสร้างคำสั่ง SQL

---

## 1. WMS.HIT_SHIP_CONFIRM (ตารางสแกนและยืนยันการจัดส่งหลัก)
- **ฐานข้อมูล:** WMS (MySQL)
- **คำอธิบาย:** ข้อมูลการสแกน PACK และ SHIP BOX ที่รอส่งข้อมูล FTP
- **คอลัมน์สำคัญ:**
  - `id` (int, PK): ลำดับรายการ
  - `plan_id` (varchar): รหัสแผนงานจัดส่ง
  - `do` (varchar): เลขที่เอกสาร Delivery Order (เช่น `HGBC2608038`)
  - `type` (varchar): ประเภทรายการ — ต้องกรองเป็น `'PACK'` สำหรับยอดส่งจริง และ `'SHIP BOX'` สำหรับกล่อง
  - `qty` (decimal): จำนวนสินค้า (ชิ้น)
  - `pallet` / `pallet_no` (varchar): หมายเลขพาเลท
  - `box` / `box_ship_name` (varchar): หมายเลขกล่อง
  - `store_lot` (varchar): รหัส Store Lot
  - `prod_lot` (varchar): รหัส Production Lot
  - `date` (datetime): วันที่ยืนยันการจัดส่ง (ใช้ฟังก์ชัน `DATE(date) = 'YYYY-MM-DD'`)
  - `invoice_date` (datetime): วันที่ออกเอกสาร Invoice

---

## 2. WMS.HIT_SHIP_TO_MASTER (ตารางตรวจสอบ Prefix & Customer Ship-To)
- **ฐานข้อมูล:** WMS (MySQL)
- **คำอธิบาย:** กำหนดค่าปลายทางของ DO ตาม Prefix 4 ตัวแรก
- **คอลัมน์สำคัญ:**
  - `prefix` (varchar, PK): 4 ตัวอักษรแรกของเลขที่ DO (เช่น `HGBC`, `HGBE`, `HGBR`)
  - `ship_to` (varchar): ปลายทางจัดส่ง (เช่น `WD Thailand`, `WD Malaysia`, `Hub`)
  - `type` (varchar): ประเภทการส่งออก
  - `status` (varchar): สถานะเปิดใช้งาน `'ACTIVE'` / `'1'`

---

## 3. WMS.SHIPMENTDO_DATA (ตารางเชื่อมโยง DO กับ Plan ID)
- **ฐานข้อมูล:** WMS (MySQL)
- **คอลัมน์สำคัญ:**
  - `do_no` (varchar, PK): เลขที่ DO
  - `plan_id` (varchar): รหัสแผนงานจัดส่ง (ใช้เชื่อมกับ `WMS.SHIPMENTPLAN_DATA`)
  - `status` (varchar): สถานะของ DO

---

## 4. WMS.SHIPMENTPLAN_DATA (ตารางรายละเอียดแผนงานจัดส่ง)
- **ฐานข้อมูล:** WMS (MySQL)
- **คำอธิบาย:** ข้อมูล PO, Part Number, และยอดรวมตามแผนงาน
- **คอลัมน์สำคัญ:**
  - `plan_id` (varchar, PK): รหัสแผนงาน
  - `item_no` (varchar): รหัสสินค้า (Belton Part Number)
  - `customer_pn` (varchar): รหัสสินค้าฝั่งลูกค้า (WD Part Number)
  - `model_name` (varchar): ชื่อรุ่นสินค้า
  - `qty` (decimal): จำนวนสินค้าตามแผนงาน *(หมายเหตุ: ใช้ `qty` เท่านั้น ห้ามใช้ `total_qty` หรือ `ship_date`)*
  - `po_no` (varchar): เลขที่ใบสั่งซื้อ Purchase Order
  - `ship_to_location` (varchar): สถานที่ปลายทางจัดส่ง

---

## 5. WMS.SHIPMENTPALLET_BOX_PROD_HTC (ตารางพาเลทและกล่องสินค้า HTC)
- **ฐานข้อมูล:** WMS (MySQL)
- **คอลัมน์สำคัญ:**
  - `plan_id` (varchar): รหัสแผนงานจัดส่ง
  - `store_lot` (varchar): Store Lot
  - `prod_lot` (varchar): Production Lot
  - `qty` (decimal): จำนวนสินค้าต่อกล่อง
  - `box_no` (varchar): หมายเลขกล่อง
  - `pallet_no` (varchar): หมายเลขพาเลท

---

## 6. WMS.lrv_wms_check_confirm_log (ตาราง Log การตรวจสอบ Confirm)
- **ฐานข้อมูล:** WMS (MySQL)
- **คอลัมน์สำคัญ:**
  - `plan_id` (varchar): รหัสแผนงานจัดส่ง
  - `status` (varchar): สถานะการตรวจสอบ
  - `created_date` (datetime): วันที่บันทึก Log

---

## 7. HITACHI.PROD_DATA & HITACHI.PACK_HEADER (ตารางสายการผลิตฝั่ง Hitachi)
- **ฐานข้อมูล (DB Key):** `hitachi` (MySQL บนเครื่อง SGFCDB02 หรือ BITINTRADEV)
- **ตาราง 1: HITACHI.PROD_DATA (ข้อมูลการผลิตและบาร์โค้ดถาด):**
  - `prod_lot` (varchar): หมายเลข Production Lot จาก WMS
  - `pack_id` (varchar): รหัส Pack ID
  - `tray_barcode` (varchar): บาร์โค้ดถาดสินค้า
  - `lot_no` (varchar): หมายเลข Lot
  - `create_dt` (datetime): วันที่บันทึก
- **ตาราง 2: HITACHI.PACK_HEADER (ข้อมูลหัวแพ็คและสถานะการจัดส่ง):**
  - `pack_id` (varchar, PK): รหัส Pack ID
  - `pack_size` (int): จำนวนสินค้าในแพ็ค (ชิ้น)
  - `ship_status` (varchar): สถานะจัดส่ง (ต้องเป็น `'Active'` จึงจะส่งไฟล์ได้)
  - `item_no` (varchar): รหัสสินค้า
  - `prod_code` (varchar): รหัสการผลิต
  - `remark` (varchar): หมายเหตุ
  - `create_dt` (datetime): วันที่บันทึก

---

## 8. WMS.HIT_FGR_PO_DATA (ตาราง PO และ Build Name หมายเหตุการผลิต)
- **ฐานข้อมูล:** WMS (MySQL)
- **คอลัมน์สำคัญ:**
  - `po_no` (varchar): เลขที่ PO
  - `item_no` (varchar): รหัสสินค้า
  - `remark` (varchar): ข้อความหมายเหตุ / Build Name (ใช้ระบุในไฟล์ส่งออก WDC)

---

## 9. MASTER.COMM_DATA (Oracle Master Model & Customer Part Number)
- **ฐานข้อมูล:** Oracle ERP Master
- **คอลัมน์สำคัญ:**
  - `item_no` (varchar): รหัสสินค้า Belton
  - `model_name` (varchar): ชื่อ Model
  - `customer_pn` (varchar): หมายเลข Part ลูกค้า (WD)

---

## 10. WMS.HIT_TRANSFER_DATA_LOG_FTP (ประวัติการส่งออกไฟล์ SFTP)
- **ฐานข้อมูล:** WMS (MySQL)
- **คอลัมน์สำคัญ:**
  - `do_no` (varchar, PK): เลขที่ DO
  - `dt_do_transfer` (datetime): วันที่และเวลาที่ส่งไฟล์สำเร็จ *(หมายเหตุ: ใช้ `dt_do_transfer` เท่านั้น ห้ามใช้ `sent_date` หรือ `log_id`)*

---

## 11. ความสัมพันธ์และการ JOIN ระหว่างตาราง (Entity Relationships)
```sql
-- ความสัมพันธ์หลักของกระบวนการ FCA
WMS.HIT_SHIP_CONFIRM s
  INNER JOIN WMS.SHIPMENTDO_DATA d ON s.do = d.do_no
  INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id
  INNER JOIN WMS.lrv_wms_check_confirm_log l ON s.plan_id = l.plan_id
  LEFT JOIN WMS.SHIPMENTPALLET_BOX_PROD_HTC b ON d.plan_id = b.plan_id
  LEFT JOIN WMS.HIT_TRANSFER_DATA_LOG_FTP log ON s.do = log.do_no
```

---

## 12. Golden Query Examples (ตัวอย่าง SQL ที่ถูกต้อง)

### 12.1 ตรวจสอบยอดรวมตาม DO และเปรียบเทียบ QTY:
```sql
SELECT 
    s.do,
    p.item_no,
    p.model_name,
    p.qty AS plan_qty,
    SUM(CASE WHEN s.type = 'PACK' THEN s.qty ELSE 0 END) AS total_pack_qty,
    COUNT(DISTINCT s.pallet_no) AS total_pallets,
    DATE(s.date) AS ship_date
FROM WMS.HIT_SHIP_CONFIRM s
INNER JOIN WMS.SHIPMENTDO_DATA d ON s.do = d.do_no
INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id
WHERE s.do = ?
GROUP BY s.do, p.item_no, p.model_name, p.qty, DATE(s.date);
```

### 12.2 ตรวจสอบประวัติการส่ง SFTP:
```sql
SELECT do_no, dt_do_transfer 
FROM WMS.HIT_TRANSFER_DATA_LOG_FTP 
WHERE do_no = ? 
ORDER BY dt_do_transfer DESC;
```
