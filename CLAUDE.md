# Project Rules & Constraints

## 1. Read-Only Directories
- The `source_code/` folder and all files within it are designated as **Read-Only**
- Do not modify, delete, or create new files in the `source_code/` folder under any circumstances

## 2. Prohibition of SendEmail Function
- **Do not call the `SendEmail` function in this project under any circumstances** (in scripts, APIs, or any new code)
- If the system encounters errors or completes operations, use logging mechanisms or display information through UI/API instead of sending emails

<!-- ## 3. Prohibition of Browser Agent Testing
- **Do not use Browser Agent (`browser_subagent`) or open browsers to test the system in this project under any circumstances**
- Users will manually test and view web pages/system themselves to avoid wasting tokens -->

---

# Project Overview

## System Purpose
Web application for debugging and monitoring FTP data transmission to Western Digital Corporation (WDC). The system handles two main product lines:

1. **ACA (Carriage)** - Carriage shipment data transmission
2. **FCA (Flex)** - Flex shipment data transmission

## Tech Stack

**Backend:**
- Node.js v16+ with Express.js
- PHP 7.4+ (Legacy FTP scripts in `source_code/`)
- EJS (Template engine)

**Database:**
- MySQL 8.0 (Primary - WMS data)
- Oracle Database (Item Master)
- MSSQL (Secondary)

**Process Manager:**
- PM2 (ecosystem.config.js)

**Security:**
- HTTPS/SSL (Production & Development)
- Express Session
- Cookie Parser

---

# Directory Structure

```
d:\wd\wd_debug_ftp_to_customer\
├── .claude/              # Claude AI configuration
├── config/               # Database & app configuration
│   └── db.js            # Database connection pool
├── database/             # Database scripts/migrations
├── log/                  # Application logs
├── public/               # Static assets (CSS, JS, images)
├── readme/               # HTML documentation
│   ├── readme_aca.html  # ACA system documentation
│   └── readme_fca.html  # FCA system documentation
├── routes/               # Express.js routes
│   ├── controller.js    # Main route controller
│   ├── middleware.js    # Authentication middleware
│   └── api/             # API endpoints
│       ├── aca/         # ACA debug APIs
│       └── fca/         # FCA debug APIs
│           └── debug_fca_api.js
├── scripts/              # Utility scripts & logs
├── source_code/          # **READ-ONLY** PHP scripts
│   ├── aca/             # Carriage FTP scripts
│   │   ├── script_ftp_to_wd.php
│   │   └── fun.php
│   └── fca/             # Flex FTP scripts
│       ├── script_ftp_to_wd.php
│       └── fun.php
├── views/                # EJS templates
│   ├── pages/
│   │   ├── aca/
│   │   │   └── debug_aca.ejs
│   │   ├── fca/
│   │   │   └── debug_fca.ejs
│   │   └── main_menu.ejs
│   └── partials/        # Reusable components
│       ├── header.ejs
│       └── script.ejs
├── app.js                # Main Express application
├── ecosystem.config.js   # PM2 configuration
├── package.json          # Dependencies
├── CLAUDE.md             # This file - Project documentation
└── GEMINI.md             # Original Thai rules
```

---

# Environment Configuration

## Available Environments

### 1. Local (`local`)
- File: `.env.local`
- Protocol: HTTP
- Port: From `.env.local`
- Database: Development database

### 2. Development (`development`)
- File: `.env.development`
- Protocol: HTTPS
- SSL Certificates: `/etc/httpd/conf/ssl.crt/`
- Database: Development database

### 3. Production (`production`)
- File: `.env.production`
- Protocol: HTTPS
- SSL Certificates: `/etc/httpd/conf/ssl.crt/`
- Database: Production database

## Running the Application

```bash
# Local development (HTTP)
npm run start

# Development server (HTTPS)
npm run dev

# Production server (HTTPS)
npm run prod
```

---

# Database Schema Overview

## ACA (Carriage) Tables
- `WMS.HGSTACA_SHIP_CONFIRM` - Shipment confirmation records
- `WMS.HGSTACA_SHIP_TO_MASTER` - Ship-to destination master
- `WMS.HGSTACA_MATCH_DATA` - DO to production lot mapping
- `WMS.HGSTACA_FGREC_BOX` - Box packaging records
- `WMS.HGSTACA_FGREC_PACK` - Pack records
- `HGSTACA.PACK_HEADER` - Tray barcode data (Production DB)
- `WMS.HGSTACA_TRANSFER_DATA_LOG` - Transfer history log
- `WMS.HGSTACA_RUNNING_TRANSFER_CUSTOMER` - Running number counter

## FCA (Flex) Tables
- `WMS.HIT_SHIP_CONFIRM` - Shipment confirmation records
- `WMS.HIT_SHIP_TO_MASTER` - Ship-to destination master
- `WMS.SHIPMENTPALLET_BOX_PROD_HTC` - Pallet/Box/Prod mapping
- `WMS.HIT_PALLET_DATA` - Pallet data
- `WMS.HIT_FGREC_DATA` - FG records with remark (Build Name)
- `HITACHI.PROD_DATA` - Production lot data (Hitachi DB)
- `HITACHI.PACK_HEADER` - Pack header with pack size (Hitachi DB)
- `WMS.HIT_TRANSFER_DATA_LOG_FTP` - FTP transfer history log
- `WMS.HIT_RUNNING_TRANSFER_CUSTOMER_FTP` - Running number counter
- `WMS.HIT_FTP_CONFIG` - FTP connection configuration

## Master Tables
- `MASTER.COMMON_ORACLE_ITEMMASTER_ORG` - Oracle item master (Model names)

---

# API Endpoints

## FCA Debug APIs (`/api/debug/fca/`)

### 1. GET `/api/debug/fca/prefixes`
Fetch active ship-to prefix master data.

**Response:**
```json
{
  "status": 200,
  "data": [
    {
      "prefix": "S001",
      "ship_to": "VMI-Hub",
      "type": "BPI"
    }
  ]
}
```

### 2. POST `/api/debug/fca/dos`
Fetch delivery orders for a specific date.

**Request Body:**
```json
{
  "date": "2026-08-10",
  "excludeSent": true
}
```

**Parameters:**
- `date` (required): Date in YYYY-MM-DD format
- `excludeSent` (optional, default: true): Filter out DOs already sent (NOT IN LOG_FTP)

**Response:**
```json
{
  "status": 200,
  "data": [
    {
      "do": "S0012345678",
      "ship_to_location": "VMI-Hub"
    }
  ]
}
```

### 3. POST `/api/debug/fca/diagnose`
Run step-by-step diagnostics for a specific DO.

**Request Body:**
```json
{
  "doNumber": "S0012345678"
}
```

**Response:**
```json
{
  "status": 200,
  "data": {
    "step1": { "status": "success", "message": "...", "data": [...] },
    "step2": { "status": "success", "message": "...", "data": [...] },
    "step3": { "status": "success", "message": "...", "data": [...] },
    "step4": { "status": "success", "message": "...", "data": [...] },
    "audit": {
      "totalConfirmQty": 1000,
      "totalPackQty": 1000,
      "mismatch": false,
      "modelUniform": true,
      "modelName": "ModelX",
      "ftpConfig": { "host": "sftp2.wdc.com", "user": "Belton", "remote_path": "/upload" }
    }
  }
}
```

---

# Key Differences: ACA vs FCA

| Aspect | ACA (Carriage) | FCA (Flex) |
|--------|----------------|------------|
| **Database Prefix** | `HGSTACA_*` | `HIT_*` |
| **Production DB** | `HGSTACA.PACK_HEADER` | `HITACHI.PROD_DATA`, `HITACHI.PACK_HEADER` |
| **DO Types** | PRB (Hub/Direct), BPI | BPI Direct only (PRB disabled) |
| **Expiry Date** | Calculated from PackKey (+2 years) | Empty (not calculated) |
| **Build Name** | Empty | From `WMS.HIT_FGREC_DATA.remark` |
| **TRAY ID** | From `PACK_HEADER.barcode` | Empty |
| **SFTP Account** | `Belton_Carriage` | `Belton` |
| **SFTP Key** | `Belton_Carriage.ppk` | `Belton.ppk` |
| **CSV Filename** | `*_BEL_CARRIAGE_*.csv` | `*_BEL_FLEX_*.csv` |
| **Transfer Log** | `HGSTACA_TRANSFER_DATA_LOG` | `HIT_TRANSFER_DATA_LOG_FTP` |

---

# Change Log

## [2026-08-13] - FCA Debug Filter Enhancement

### Added
- **Checkbox filter option** in FCA debug page to toggle exclusion of already-sent DOs
- UI component: "กรอง DO ที่ส่งแล้ว (ตัดรายการที่มีใน LOG_FTP ออก)"
- Default state: Checked (exclude sent DOs)

### Modified Files
1. **`views/pages/fca/debug_fca.ejs`**
   - Added `excludeSentDOs` data property (default: `true`)
   - Added checkbox UI component with label
   - Updated `fetchDOs()` method to send `excludeSent` parameter
   - Updated SQL display in `getSqlText('dos')` to conditionally show exclusion clause

2. **`routes/api/fca/debug_fca_api.js`**
   - Modified `/api/debug/fca/dos` endpoint to accept `excludeSent` parameter
   - Dynamic SQL construction based on `excludeSent` flag
   - When `excludeSent = true`: Adds `AND s.do NOT IN (SELECT do_no FROM WMS.HIT_TRANSFER_DATA_LOG_FTP)`
   - When `excludeSent = false`: Shows all DOs regardless of transfer status

### Technical Details
- **Query Condition**: `AND s.do NOT IN (SELECT do_no FROM WMS.HIT_TRANSFER_DATA_LOG_FTP)`
- **Purpose**: Allow users to see both sent and unsent DOs for debugging purposes
- **Use Case**: When investigating historical data or re-checking already transmitted DOs

### API Changes
**Endpoint**: `POST /api/debug/fca/dos`

**Before:**
```javascript
{ date: "2026-08-10" }
```

**After:**
```javascript
{
  date: "2026-08-10",
  excludeSent: true  // Optional, defaults to showing exclusion
}
```

---

# Known Issues

None reported.

---

# Future Enhancements

- [ ] Add similar filter option to ACA debug page
- [ ] Implement batch re-processing for failed transfers
- [ ] Add export functionality for diagnostic results
- [ ] Create unified dashboard for both ACA and FCA monitoring

---

**Last Updated**: 2026-08-13  
**Maintained By**: IT Development Team
