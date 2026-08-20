# FCA Advanced Debugger - Testing Guide

## Overview
ระบบ FCA Advanced Debugger ใหม่ที่สร้างขึ้นเพื่อวิเคราะห์ข้อมูล DO ทั้งหมดพร้อมกัน พร้อมแสดง Error Summary และรองรับการเลือก Database Connection

---

## Features

### 1. Batch Analysis Mode
- วิเคราะห์ DO ทั้งหมดในวันที่เลือกพร้อมกัน
- แสดงผลลัพธ์แบบ Grid View
- แยกแสดง DO ที่มี Error และไม่มี Error ด้วยสีที่ชัดเจน

### 2. Connection Mode Selection
- **Current Environment** - ใช้ connection ตามที่ตั้งค่าใน NODE_ENV
- **Production** - บังคับใช้ Production database
- **Development** - บังคับใช้ Development database

### 3. Error Summary
- แสดงจำนวน Error ทั้งหมดในแต่ละ DO
- แยกประเภท Error ตาม Step (Step 1-4, Audit)
- แสดงรายละเอียด Error พร้อม Error Code และ Message

### 4. Detailed Step Analysis
- แต่ละ Step แสดง Connection Mode ที่ใช้
- แสดง SQL Query ที่ใช้ในการดึงข้อมูล
- แสดง Database Error พร้อม Error Code
- แสดงข้อมูลในรูปแบบตาราง

---

## Files Created/Modified

### New Files

#### 1. API Controller
**File:** `routes/api/fca/debug_fca_advanced_api.js`

**Endpoints:**
- `POST /api/debug/fca/batch-diagnose`
  - รับ: `{ date, excludeSent, connectionMode }`
  - คืน: รายการ DO ทั้งหมดพร้อม diagnosis results

- `POST /api/debug/fca/diagnose-detail`
  - รับ: `{ doNumber, connectionMode }`
  - คืน: รายละเอียด diagnosis ของ DO เดียว

**Key Functions:**
- `executeQuery()` - Helper สำหรับ execute query พร้อมเลือก connection
- `diagnoseSingleDO()` - วิเคราะห์ DO เดียวแบบละเอียด พร้อม error tracking

#### 2. View Template
**File:** `views/pages/fca/debug_fca_advanced.ejs`

**Features:**
- Vue.js SPA
- Responsive Grid Layout
- Modal สำหรับแสดงรายละเอียด
- SQL Viewer แต่ละ Step
- Connection Badge แสดงที่ทุก Block

### Modified Files

#### 1. Route Controller
**File:** `routes/controller.js`

เพิ่ม route:
```javascript
router.get('/debug-fca-advanced', checkLoginSession, (req, res) => {
  res.render('pages/fca/debug_fca_advanced')
})
```

#### 2. Main Menu
**File:** `views/pages/main_menu.ejs`

เพิ่มการ์ดใหม่ "FCA Advanced Debugger" พร้อม badge "NEW"

---

## How to Test

### 1. Start the Server
```bash
# Local
npm run start

# Development
npm run dev

# Production
npm run prod
```

### 2. Access the Page
Navigate to: `http://localhost:PORT/debug-fca-advanced`

### 3. Test Scenarios

#### Scenario 1: Basic Batch Analysis (Current Environment)
1. เลือกวันที่: `2026-08-10`
2. Connection Mode: `Current Environment`
3. เลือก "กรอง DO ที่ส่งแล้ว": ✓
4. กดปุ่ม "รันการวิเคราะห์ทั้งหมด"
5. **Expected:** แสดง DO cards ทั้งหมด แยกสีเขียว (ไม่มี error) และแดง (มี error)

#### Scenario 2: Test with Production Database
1. เลือกวันที่: `2026-08-10`
2. Connection Mode: `Production`
3. กดปุ่ม "รันการวิเคราะห์ทั้งหมด"
4. **Expected:** ดึงข้อมูลจาก Production DB, Connection badge แสดงเป็น "PRODUCTION" สีแดง

#### Scenario 3: Test with Development Database
1. เลือกวันที่: `2026-08-10`
2. Connection Mode: `Development`
3. กดปุ่ม "รันการวิเคราะห์ทั้งหมด"
4. **Expected:** ดึงข้อมูลจาก Development DB, Connection badge แสดงเป็น "DEVELOPMENT" สีน้ำเงิน

#### Scenario 4: View DO Details
1. หลังจากรัน batch analysis แล้ว
2. คลิกที่ DO card ที่มี error
3. **Expected:** เปิด Modal แสดงรายละเอียด
   - แสดง Error Summary ที่ด้านบน
   - แสดง Step 1-4 พร้อม Connection Badge
   - แต่ละ Step มีปุ่มแสดง/ซ่อน
   - คลิก "แสดง SQL Query" เพื่อดู SQL

#### Scenario 5: SQL Query Viewer
1. เปิด DO detail modal
2. คลิก "▶ แสดง" ที่ Step 1
3. คลิก "🔍 แสดง SQL Query"
4. **Expected:** แสดง SQL query ที่ใช้จริง พร้อมค่า parameter
5. มีปุ่ม "คัดลอก" เพื่อ copy SQL

#### Scenario 6: Error Details
1. เลือก DO ที่มี Database Error
2. คลิกดู Detail
3. **Expected:** 
   - Error Summary แสดงที่ด้านบน (สีแดง)
   - Step ที่ error แสดง Error Code และ Message
   - แสดง SQL Query ที่ทำให้เกิด error

---

## Expected Error Types

### 1. Database Errors
- **Type:** `database`
- **Example:** Connection timeout, Table not found
- **Display:** แสดง error message และ error code

### 2. No Data Errors
- **Type:** `no_data`
- **Example:** ไม่พบข้อมูล WMS, ไม่พบข้อมูล Hitachi
- **Display:** แสดง message ว่าไม่พบข้อมูลในตารางใด

### 3. Quantity Mismatch
- **Type:** `qty_mismatch`
- **Example:** WMS Qty ≠ Hitachi Qty
- **Display:** แสดงจำนวนที่แตกต่าง

### 4. Multiple Customer PNs
- **Type:** `warning`
- **Example:** DO มี Part Number หลายตัว
- **Display:** แสดง warning message

---

## API Response Structure

### Batch Diagnose Response
```json
{
  "status": 200,
  "data": {
    "connectionMode": "current",
    "totalDOs": 5,
    "results": [
      {
        "do": "S0011234567",
        "ship_to_location": "VMI-Hub",
        "hasError": true,
        "errorCount": 2,
        "errors": [
          {
            "step": 1,
            "type": "no_data",
            "message": "ไม่พบข้อมูลการจับคู่ลอต WMS"
          },
          {
            "step": "audit",
            "type": "qty_mismatch",
            "message": "Quantity mismatch: WMS=1000, Hitachi=950"
          }
        ],
        "steps": {
          "step1": {
            "status": "error",
            "message": "ไม่พบข้อมูลการจับคู่ลอต WMS สำหรับ DO: S0011234567",
            "data": [],
            "error": null
          },
          "step2": { ... },
          "step3": { ... },
          "step4": { ... }
        },
        "audit": {
          "totalConfirmQty": 1000,
          "totalPackQty": 950,
          "mismatch": true,
          "modelUniform": true,
          "modelName": "ModelX",
          "ftpConfig": { ... }
        }
      }
    ]
  }
}
```

---

## Database Connection Pools Used

### Current Environment Mode
- `DB` - WMS Pool (from current env)
- `DB_HITACHI` - Hitachi Pool (from current env)

### Production Mode
- `DB_PROD_WMS` - Production WMS Pool
- `DB_PROD_HITACHI` - Production Hitachi Pool

### Development Mode
- `DB_DEV_WMS` - Development WMS Pool
- `DB_DEV_HITACHI` - Development Hitachi Pool

**Note:** All connection pools are already initialized in `config/db.js`

---

## Performance Considerations

### Batch Mode
- วิเคราะห์ DO ทีละตัว (sequential)
- ถ้ามี DO มาก (>20) อาจใช้เวลานาน
- แสดง loading spinner ระหว่างประมวลผล

### Connection Pool
- ใช้ connection pool ที่มีอยู่แล้ว
- Release connection หลังใช้งานเสร็จทุกครั้ง
- No memory leak

---

## UI/UX Features

### 1. Color Coding
- **Green Cards:** DO ไม่มี error (border-green-400)
- **Red Cards:** DO มี error (border-red-400)
- **Connection Badges:**
  - Red: Production
  - Blue: Development
  - Gray: Current

### 2. Responsive Design
- Grid: 1 column (mobile) → 2 columns (tablet) → 3 columns (desktop)
- Modal: Full screen on mobile, centered on desktop

### 3. Interactive Elements
- Hover effects on DO cards
- Expandable step blocks
- Collapsible SQL viewers
- Copy SQL to clipboard

---

## Troubleshooting

### Issue 1: "Cannot fetch DOs"
**Cause:** Database connection error
**Solution:** Check database configuration in `config/db.js`

### Issue 2: Empty results
**Cause:** No data for selected date
**Solution:** Try different date or uncheck "กรอง DO ที่ส่งแล้ว"

### Issue 3: Slow batch analysis
**Cause:** Too many DOs
**Solution:** This is expected behavior. Consider adding pagination.

### Issue 4: Connection mode not working
**Cause:** Database pools not initialized
**Solution:** Check `config/db.js` and ensure all pools are created

---

## Next Steps (Future Enhancements)

1. **Parallel Processing:** ใช้ Promise.all() แทน sequential loop
2. **Pagination:** จำกัด DO per page
3. **Export功能:** Export ผลลัพธ์เป็น CSV/Excel
4. **Real-time Updates:** WebSocket สำหรับ batch progress
5. **Filtering:** Filter by error type, ship_to_location
6. **Sorting:** Sort by error count, DO number
7. **ACA Advanced:** สร้างหน้าเดียวกันสำหรับ ACA

---

**Created:** 2026-08-13  
**Version:** 1.0  
**Author:** IT Development Team
