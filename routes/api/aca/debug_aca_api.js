const express = require('express');
const router = express.Router();
const { exeQuery } = require('../../../config/db.js');

// 1. Fetch DOs for selected date
router.post('/debug/aca/dos', async (req, res) => {
  try {
    const { date } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const sql = `
      SELECT s.do, p.ship_to_location 
      FROM WMS.HGSTACA_SHIP_CONFIRM s 
      INNER JOIN WMS.lrv_wms_check_confirm_log l ON s.plan_id = l.plan_id
      INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
      WHERE DATE(s.date) = ? AND s.type = 'PACK'
      GROUP BY s.do, p.ship_to_location
      ORDER BY s.do
    `;
    const rows = await exeQuery(sql, [date]);
    return res.json({ status: 200, data: rows || [] });
  } catch (err) {
    console.error('Error fetching ACA DOs:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 2. Fetch Prefix Master
router.get('/debug/aca/prefixes', async (req, res) => {
  try {
    const sql = `
      SELECT prefix, ship_to, type 
      FROM WMS.HGSTACA_SHIP_TO_MASTER 
      WHERE status = 'active'
    `;
    const rows = await exeQuery(sql, []);
    return res.json({ status: 200, data: rows || [] });
  } catch (err) {
    console.error('Error fetching ACA prefixes:', err);
    return res.status(500).json({ error: err.message });
  }
});

// 3. Diagnose DO step-by-step
router.post('/debug/aca/diagnose', async (req, res) => {
  try {
    const { doNumber } = req.body;
    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }

    let diagnostics = {
      step1: { status: 'pending', message: '', data: [] },
      step2: { status: 'pending', message: '', data: [] },
      step3: { status: 'pending', message: '', data: [] },
      step4: { status: 'pending', message: '', data: [] },
      audit: {
        totalConfirmQty: 0,
        totalPackQty: 0,
        mismatch: false,
        modelUniform: true,
        modelName: '',
        expiryCalculations: [],
        ftpConfig: null
      }
    };

    // --- STEP 1: WMS Match Data ---
    const matchSql = `
      SELECT d.plan_id, d.do_no, p.customer_pn, p.item_no, p.model_name, p.qty as plan_qty, 
             m.store_lot, m.prod_lot, m.lot_size as qty_boxs, p.po_no, m.box_no
      FROM WMS.SHIPMENTDO_DATA d 
      INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id
      INNER JOIN WMS.HGSTACA_MATCH_DATA m ON d.do_no = m.do_no
      WHERE d.do_no = ?
      ORDER BY m.box_no
    `;
    const matchRows = await exeQuery(matchSql, [doNumber]);
    diagnostics.step1.data = matchRows || [];

    if (!matchRows || matchRows.length === 0) {
      diagnostics.step1.status = 'error';
      diagnostics.step1.message = `ไม่พบข้อมูลการจับคู่ลอตชิ้นงานใน WMS.HGSTACA_MATCH_DATA สำหรับ DO: ${doNumber}`;
      return res.json({ status: 200, data: diagnostics });
    }
    diagnostics.step1.status = 'success';
    diagnostics.step1.message = `พบข้อมูลการจับคู่ลอตชิ้นงาน ${matchRows.length} รายการ`;

    // Extract unique lots
    const prodLots = [...new Set(matchRows.map(r => r.prod_lot).filter(Boolean))];
    const storeLots = [...new Set(matchRows.map(r => r.store_lot).filter(Boolean))];
    const itemNo = matchRows[0].item_no;
    const customerPns = matchRows.map(r => r.customer_pn);

    // Check customer PN uniformity
    const uniqueCustomerPns = [...new Set(customerPns)];
    if (uniqueCustomerPns.length > 1) {
      diagnostics.audit.modelUniform = false;
    }

    // --- STEP 2: Ship Confirm & Pallet Data ---
    if (prodLots.length > 0) {
      const confirmSql = `
        SELECT s.pallet_no as pallet_running, s.box_detail, DATE_FORMAT(s.date,'%d-%M-%Y') as ship_date, 
               d.qty_pallet, s.prod_lot, s.qty, s.box
        FROM WMS.HGSTACA_SHIP_CONFIRM s
        INNER JOIN WMS.HGSTACA_PALLET_DATA d ON s.pallet_no = d.running_pallet
        WHERE s.prod_lot IN (?) AND s.type = 'pack' AND d.status = 'Active'
      `;
      const confirmRows = await exeQuery(confirmSql, [prodLots]);
      diagnostics.step2.data = confirmRows || [];

      if (!confirmRows || confirmRows.length === 0) {
        diagnostics.step2.status = 'error';
        diagnostics.step2.message = `ไม่พบข้อมูลยืนยันการจัดส่งใน WMS.HGSTACA_SHIP_CONFIRM / HGSTACA_PALLET_DATA สำหรับลอตผลิต: ${prodLots.join(', ')}`;
      } else {
        diagnostics.step2.status = 'success';
        diagnostics.step2.message = `พบข้อมูลยืนยันการจัดส่งและพาเลททั้งหมด ${confirmRows.length} รายการ`;
        // Sum total confirm qty
        diagnostics.audit.totalConfirmQty = confirmRows.reduce((acc, row) => acc + (row.qty || 0), 0);
      }
    } else {
      diagnostics.step2.status = 'error';
      diagnostics.step2.message = 'ไม่มีรายการลอตผลิต (Production Lot) สำหรับประมวลผลต่อ';
    }

    // --- STEP 3: WMS Pack Mappings ---
    if (storeLots.length > 0) {
      const packWmsSql = `
        SELECT b.store_lot, b.box_no, b.prod_lot, p.pack_id
        FROM WMS.HGSTACA_FGREC_BOX b
        INNER JOIN WMS.HGSTACA_FGREC_PACK p ON b.id = p.box_id
        WHERE b.store_lot IN (?) AND b.box_status = 'Active'
      `;
      const packWmsRows = await exeQuery(packWmsSql, [storeLots]);
      diagnostics.step3.data = packWmsRows || [];

      if (!packWmsRows || packWmsRows.length === 0) {
        diagnostics.step3.status = 'error';
        diagnostics.step3.message = `ไม่พบรหัสบรรจุภัณฑ์ (Pack ID) ใน WMS.HGSTACA_FGREC_BOX/PACK สำหรับคลังจัดเก็บ: ${storeLots.join(', ')}`;
      } else {
        diagnostics.step3.status = 'success';
        diagnostics.step3.message = `พบหมายเลขแพ็กเกจกล่อง WMS (Pack ID) ทั้งหมด ${packWmsRows.length} รายการ`;
      }
    } else {
      diagnostics.step3.status = 'error';
      diagnostics.step3.message = 'ไม่มีรายการคลังจัดเก็บ (Store Lot) สำหรับประมวลผลต่อ';
    }

    // --- STEP 4: Physical Barcode (Hitachi PACK_HEADER) ---
    const packIds = diagnostics.step3.data.map(r => r.pack_id).filter(Boolean);
    if (packIds.length > 0) {
      const packHeaderSql = `
        SELECT pack_id, tot_qty_pack, barcode 
        FROM HGSTACA.PACK_HEADER 
        WHERE pack_id IN (?)
      `;
      const packHeaderRows = await exeQuery(packHeaderSql, [packIds]);
      diagnostics.step4.data = packHeaderRows || [];

      if (!packHeaderRows || packHeaderRows.length === 0) {
        diagnostics.step4.status = 'error';
        diagnostics.step4.message = `ไม่พบข้อมูลบาร์โค้ดถาดสินค้าในระบบฝั่งผลิต HGSTACA.PACK_HEADER สำหรับ Pack ID: ${packIds.join(', ')}`;
      } else {
        diagnostics.step4.status = 'success';
        diagnostics.step4.message = `ดึงข้อมูลบาร์โค้ดถาดสินค้าบรรจุสำเร็จ ${packHeaderRows.length} รายการ`;
        diagnostics.audit.totalPackQty = packHeaderRows.reduce((acc, row) => acc + (row.tot_qty_pack || 0), 0);
      }
    } else {
      diagnostics.step4.status = 'error';
      diagnostics.step4.message = 'ไม่พบรหัสบรรจุภัณฑ์สำหรับการไปตรวจสอบบาร์โค้ดถาดฝั่งผลิต';
    }

    // --- STEP 5: Audit Mismatches & Expiry calculations ---
    // Check if totals match
    if (diagnostics.audit.totalConfirmQty !== diagnostics.audit.totalPackQty) {
      diagnostics.audit.mismatch = true;
    }

    // Fetch model name from Master if uniform
    if (diagnostics.audit.modelUniform && itemNo) {
      const modelSql = `
        SELECT model_name 
        FROM MASTER.COMMON_ORACLE_ITEMMASTER_ORG 
        WHERE item_no = ? LIMIT 1
      `;
      const modelRows = await exeQuery(modelSql, [itemNo]);
      if (modelRows && modelRows.length > 0) {
        const fullName = modelRows[0].model_name || '';
        const cutIdx = fullName.indexOf('(');
        diagnostics.audit.modelName = cutIdx !== -1 ? fullName.substring(0, cutIdx - 1).trim() : fullName;
      }
    } else {
      diagnostics.audit.modelName = 'All';
    }

    // Expiry date simulation for UI mapping
    packIds.forEach(packId => {
      if (packId.length >= 10) {
        const dateString = packId.substring(4, 10); // e.g. "250707"
        const yearShort = dateString.substring(0, 2);
        const month = dateString.substring(2, 4);
        const dayStr = dateString.substring(4, 6);

        let fullYear = parseInt(yearShort) + 2000 + 2;
        let finalDay = dayStr;

        // Leap year handling
        const isLeapYear = (fullYear % 4 === 0 && fullYear % 100 !== 0) || (fullYear % 400 === 0);
        if (month === '02' && finalDay === '29' && !isLeapYear) {
          finalDay = '28';
        }

        const computedExpireStr = `${fullYear}-${month}-${finalDay}`;
        diagnostics.audit.expiryCalculations.push({
          packId,
          prefix: packId.substring(0, 7),
          rawDate: dateString,
          computedDate: computedExpireStr
        });
      }
    });

    // Fetch FTP configurations
    const ftpSql = `SELECT host, user, remote_path FROM WMS.HGSTACA_FTP_CONFIG LIMIT 1`;
    const ftpRows = await exeQuery(ftpSql, []);
    if (ftpRows && ftpRows.length > 0) {
      diagnostics.audit.ftpConfig = ftpRows[0];
    }

    return res.json({ status: 200, data: diagnostics });
  } catch (err) {
    console.error('Error running ACA diagnostics:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
