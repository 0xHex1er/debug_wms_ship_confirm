const express = require('express');
const router = express.Router();
const { exeQuery, exeQueryHitachi, exeQueryEnv, DB_PROD_WMS, DB_DEV_WMS, DB_PROD_HITACHI, DB_DEV_HITACHI } = require('../../../config/db.js');

// Helper to determine environment name
const resolveEnv = (env) => {
  if (!env) return 'production';
  return (env === 'dev' || env === 'development') ? 'development' : 'production';
};

// Helper to clean buffer values
const cleanVal = (val) => {
  if (val === null || val === undefined) return '';
  if (Buffer.isBuffer(val)) return val.toString('utf8');
  if (typeof val === 'object' && val.type === 'Buffer' && Array.isArray(val.data)) {
    return Buffer.from(val.data).toString('utf8');
  }
  return typeof val === 'object' ? JSON.stringify(val) : String(val);
};

// Helper to interpolate SQL parameters for inspection without '?' placeholders
const formatSql = (sql, params) => {
  if (!sql) return '';
  if (!params || !Array.isArray(params) || params.length === 0) return sql.trim();

  const formatVal = (v) => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (Array.isArray(v)) {
      if (v.length === 0) return "''";
      return v.map(item => {
        if (item === null || item === undefined) return 'NULL';
        if (typeof item === 'number') return item;
        return `'${String(item).replace(/'/g, "\\'")}'`;
      }).join(', ');
    }
    return `'${String(v).replace(/'/g, "\\'")}'`;
  };

  let paramIndex = 0;
  const formatted = sql.replace(/\?/g, () => {
    if (paramIndex < params.length) {
      const val = params[paramIndex++];
      return formatVal(val);
    }
    return '?';
  });

  return formatted.trim();
};

// ============================================================================
// 1. Fetch DOs for selected date (with excludeSent and env option)
// ============================================================================
router.post('/debug/fca/dos', async (req, res) => {
  try {
    const { date, excludeSent = true, env = 'production' } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
    }

    const targetEnv = resolveEnv(env);
    const excludeClause = excludeSent
      ? 'AND s.do NOT IN (SELECT do_no FROM WMS.HIT_TRANSFER_DATA_LOG_FTP)'
      : '';

    const sql = `
      SELECT s.do, p.ship_to_location,
             (SELECT COUNT(*) FROM WMS.HIT_TRANSFER_DATA_LOG_FTP WHERE do_no = s.do) as is_sent
      FROM WMS.HIT_SHIP_CONFIRM s 
      INNER JOIN WMS.lrv_wms_check_confirm_log l ON s.plan_id = l.plan_id
      INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
      WHERE DATE(s.date) = ? AND s.type = 'PACK'
      ${excludeClause}
      GROUP BY s.do, p.ship_to_location
      ORDER BY s.do
    `;

    const rows = await exeQueryEnv('wms', targetEnv, sql, [date]);
    return res.json({ status: 200, env: targetEnv, data: rows || [] });
  } catch (err) {
    console.error('Error fetching FCA DOs:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 2. Fetch Prefix Master Data
// ============================================================================
router.get('/debug/fca/prefixes', async (req, res) => {
  try {
    const targetEnv = resolveEnv(req.query.env);
    const sql = `
      SELECT prefix, ship_to, type, status 
      FROM WMS.HIT_SHIP_TO_MASTER 
      WHERE status = 'active'
      ORDER BY prefix
    `;
    const rows = await exeQueryEnv('wms', targetEnv, sql, []);
    return res.json({ status: 200, env: targetEnv, data: rows || [] });
  } catch (err) {
    console.error('Error fetching FCA prefixes:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 3. Diagnose Single DO Step-by-Step with Per-Block Environment Switch
// ============================================================================
router.post('/debug/fca/diagnose', async (req, res) => {
  try {
    const { doNumber, environments = {} } = req.body;
    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }

    const prefix = doNumber.substring(0, 4);

    // Resolve per-step environment
    const env1 = resolveEnv(environments.step1 || environments.default);
    const env2 = resolveEnv(environments.step2 || environments.default);
    const env3 = resolveEnv(environments.step3 || environments.default);
    const env4 = resolveEnv(environments.step4 || environments.default);
    const env5 = resolveEnv(environments.step5 || environments.default);
    const env6 = resolveEnv(environments.step6 || environments.default);
    const env7 = resolveEnv(environments.step7 || environments.default);
    const env8 = resolveEnv(environments.step8 || environments.default);
    const env9 = resolveEnv(environments.step9 || environments.default);
    const env10 = resolveEnv(environments.step10 || environments.default);

    const diagnostics = {
      doNumber,
      prefix,
      step1_trigger: { status: 'pending', message: '', env: env1, data: [], sql: '', executionTime: 0 },
      step2_prefix: { status: 'pending', message: '', env: env2, data: null, sql: '', executionTime: 0 },
      step3_wms: { status: 'pending', message: '', env: env3, data: [], sql: '', executionTime: 0 },
      step4_ship_confirm: { status: 'pending', message: '', env: env4, data: [], sql: '', executionTime: 0 },
      step5_hitachi_pack: { status: 'pending', message: '', env: env5, data: [], sql: '', executionTime: 0 },
      step6_pack_header: { status: 'pending', message: '', env: env6, data: [], sql: '', executionTime: 0 },
      step7_build_name: { status: 'pending', message: '', env: env7, data: [], sql: '', executionTime: 0 },
      step8_oracle_model: { status: 'pending', message: '', env: env8, data: null, sql: '', executionTime: 0 },
      step9_audit_csv: { status: 'pending', message: '', env: env9, data: [], sql: '', executionTime: 0 },
      step10_sftp_config: { status: 'pending', message: '', env: env10, data: null, sql: '', executionTime: 0 },
      audit: {
        totalConfirmQty: 0,
        totalPackQty: 0,
        mismatch: false,
        modelUniform: true,
        modelName: '',
        rawModelName: '',
        customerPns: [],
        prodLots: [],
        storeLots: [],
        runningNumber: null,
        targetFilename: '',
        csvRowsCount: 0,
        isSentBefore: false,
        sentDate: null
      }
    };

    // --- STEP 1: TRIGGER & DO INFO ---
    const t1 = Date.now();
    const triggerSql = `
      SELECT s.do, s.plan_id, s.pallet_no, s.date, s.type, p.ship_to_location, p.customer_pn
      FROM WMS.HIT_SHIP_CONFIRM s 
      INNER JOIN WMS.lrv_wms_check_confirm_log l ON s.plan_id = l.plan_id
      INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
      WHERE s.do = ? AND s.type = 'PACK'
      LIMIT 10
    `;
    diagnostics.step1_trigger.sql = formatSql(triggerSql, [doNumber]);
    const triggerRows = await exeQueryEnv('wms', env1, triggerSql, [doNumber]);
    diagnostics.step1_trigger.executionTime = Date.now() - t1;
    diagnostics.step1_trigger.data = triggerRows || [];

    if (!triggerRows || triggerRows.length === 0) {
      diagnostics.step1_trigger.status = 'error';
      diagnostics.step1_trigger.message = `[${env1.toUpperCase()}] ไม่พบข้อมูลยืนยันการส่งมอบสำหรับ DO: ${doNumber} ใน WMS.HIT_SHIP_CONFIRM (type='PACK')`;
    } else {
      diagnostics.step1_trigger.status = 'success';
      diagnostics.step1_trigger.message = `[${env1.toUpperCase()}] พบข้อมูลยืนยันการส่งมอบเริ่มต้นสำหรับ DO: ${doNumber}`;
    }

    // Check if DO was previously sent
    const logSql = `SELECT do_no, dt_do_transfer FROM WMS.HIT_TRANSFER_DATA_LOG_FTP WHERE do_no = ? ORDER BY dt_do_transfer DESC LIMIT 1`;
    const logRows = await exeQueryEnv('wms', env1, logSql, [doNumber]);
    if (logRows && logRows.length > 0) {
      diagnostics.audit.isSentBefore = true;
      diagnostics.audit.sentDate = logRows[0].dt_do_transfer;
    }

    // --- STEP 2: PREFIX MASTER & ROUTING ---
    const t2 = Date.now();
    const prefixSql = `
      SELECT prefix, ship_to, type, status 
      FROM WMS.HIT_SHIP_TO_MASTER 
      WHERE prefix = ? AND status = 'active'
      LIMIT 1
    `;
    diagnostics.step2_prefix.sql = formatSql(prefixSql, [prefix]);
    const prefixRows = await exeQueryEnv('wms', env2, prefixSql, [prefix]);
    diagnostics.step2_prefix.executionTime = Date.now() - t2;

    if (!prefixRows || prefixRows.length === 0) {
      diagnostics.step2_prefix.status = 'error';
      diagnostics.step2_prefix.message = `[${env2.toUpperCase()}] ไม่พบการตั้งค่า Prefix '${prefix}' ใน WMS.HIT_SHIP_TO_MASTER (หรือสถานะไม่ได้เป็น active)`;
      diagnostics.step2_prefix.data = { prefix, ship_to: 'UNKNOWN', type: 'UNKNOWN', status: 'missing' };
    } else {
      const prefixInfo = prefixRows[0];
      diagnostics.step2_prefix.data = prefixInfo;
      if (prefixInfo.type === 'PRB') {
        diagnostics.step2_prefix.status = 'warning';
        diagnostics.step2_prefix.message = `[${env2.toUpperCase()}] Prefix '${prefix}' ถูกระบุเป็นประเภท PRB ซึ่งในระบบ FCA ฟังก์ชันการส่ง PRB ถูกระงับการทำงาน (Disabled ใน script_ftp_to_wd.php)`;
      } else {
        diagnostics.step2_prefix.status = 'success';
        diagnostics.step2_prefix.message = `[${env2.toUpperCase()}] Prefix '${prefix}' เป็นประเภท '${prefixInfo.type}' จัดส่งไปยัง '${prefixInfo.ship_to}'`;
      }
    }

    // --- STEP 3: WMS MATCH & LOT DATA ---
    const t3 = Date.now();
    const wmsSql = `
      SELECT d.plan_id, d.do_no, p.customer_pn, p.item_no, p.model_name, p.qty as plan_qty, 
             b.store_lot, b.prod_lot, b.qty as qty_boxs, p.po_no
      FROM (WMS.SHIPMENTDO_DATA d 
            INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id)
      INNER JOIN WMS.SHIPMENTPALLET_BOX_PROD_HTC b ON d.plan_id = b.plan_id
      WHERE d.do_no = ?
      ORDER BY d.do_no, b.store_lot, b.prod_lot
    `;
    diagnostics.step3_wms.sql = formatSql(wmsSql, [doNumber]);
    const wmsRows = await exeQueryEnv('wms', env3, wmsSql, [doNumber]);
    diagnostics.step3_wms.executionTime = Date.now() - t3;
    diagnostics.step3_wms.data = wmsRows || [];

    if (!wmsRows || wmsRows.length === 0) {
      diagnostics.step3_wms.status = 'error';
      diagnostics.step3_wms.message = `[${env3.toUpperCase()}] ไม่พบข้อมูลแผนงานจัดส่งหรือพาเลทกล่องใน WMS.SHIPMENTPALLET_BOX_PROD_HTC สำหรับ DO: ${doNumber}`;
      return res.json({ status: 200, data: diagnostics });
    }

    diagnostics.step3_wms.status = 'success';
    diagnostics.step3_wms.message = `[${env3.toUpperCase()}] พบข้อมูลการเชื่อมโยงชิ้นงาน WMS ทั้งหมด ${wmsRows.length} รายการ`;

    // Extract Unique Lots & Customer PNs
    const prodLots = [...new Set(wmsRows.map(r => r.prod_lot).filter(Boolean))];
    const storeLots = [...new Set(wmsRows.map(r => r.store_lot).filter(Boolean))];
    const customerPns = wmsRows.map(r => r.customer_pn).filter(Boolean);
    const itemNos = [...new Set(wmsRows.map(r => r.item_no).filter(Boolean))];

    diagnostics.audit.prodLots = prodLots;
    diagnostics.audit.storeLots = storeLots;
    diagnostics.audit.customerPns = [...new Set(customerPns)];

    if (new Set(customerPns).size > 1) {
      diagnostics.audit.modelUniform = false;
    }

    // --- STEP 4: SHIP CONFIRM & PALLET DATA ---
    const t4 = Date.now();
    if (prodLots.length > 0) {
      const confirmSql = `
        SELECT s.pallet_no as pallet_running, s.box_detail, 
               DATE_FORMAT(s.date, '%d-%M-%Y') as ship_date, 
               d.qty_pallet, s.prod_lot, s.box_ship_name
        FROM WMS.HIT_SHIP_CONFIRM AS s
        INNER JOIN WMS.HIT_PALLET_DATA d ON s.pallet_no = d.running_pallet
        WHERE s.prod_lot IN (?)
          AND s.type = 'pack' 
          AND d.status = 'Active'
      `;
      diagnostics.step4_ship_confirm.sql = formatSql(confirmSql, [prodLots]);
      const confirmRows = await exeQueryEnv('wms', env4, confirmSql, [prodLots]);
      diagnostics.step4_ship_confirm.executionTime = Date.now() - t4;
      diagnostics.step4_ship_confirm.data = confirmRows || [];

      if (!confirmRows || confirmRows.length === 0) {
        diagnostics.step4_ship_confirm.status = 'error';
        diagnostics.step4_ship_confirm.message = `[${env4.toUpperCase()}] ไม่พบข้อมูลยืนยันการจัดส่งพาเลทใน WMS.HIT_SHIP_CONFIRM / HIT_PALLET_DATA สำหรับลอตผลิต: ${prodLots.join(', ')}`;
      } else {
        diagnostics.step4_ship_confirm.status = 'success';
        diagnostics.step4_ship_confirm.message = `[${env4.toUpperCase()}] พบข้อมูลพาเลทและการยืนยันจัดส่ง ${confirmRows.length} รายการ`;
      }
    } else {
      diagnostics.step4_ship_confirm.status = 'error';
      diagnostics.step4_ship_confirm.message = 'ไม่มีรหัส Production Lot สำหรับตรวจสอบการจัดส่งพาเลท';
    }

    // --- STEP 5: PRODUCTION PACKING DATA (HITACHI.PROD_DATA) ---
    const t5 = Date.now();
    let hitachiProdRows = [];
    let packIds = [];
    if (prodLots.length > 0) {
      const prodSql = `
        SELECT p.prod_lot, p.pack_id 
        FROM HITACHI.PROD_DATA p 
        WHERE p.prod_lot IN (?)
      `;
      diagnostics.step5_hitachi_pack.sql = formatSql(prodSql, [prodLots]);
      hitachiProdRows = await exeQueryEnv('hitachi', env5, prodSql, [prodLots]);
      diagnostics.step5_hitachi_pack.executionTime = Date.now() - t5;
      diagnostics.step5_hitachi_pack.data = hitachiProdRows || [];

      // Check for lots missing pack_id
      const lotsFoundInProd = new Set((hitachiProdRows || []).map(r => r.prod_lot).filter(Boolean));
      const missingLotsInProd = prodLots.filter(l => !lotsFoundInProd.has(l));
      const emptyPackRows = (hitachiProdRows || []).filter(r => !r.pack_id || String(r.pack_id).trim() === '');
      packIds = [...new Set((hitachiProdRows || []).map(r => r.pack_id).filter(Boolean))];

      if (!hitachiProdRows || hitachiProdRows.length === 0) {
        diagnostics.step5_hitachi_pack.status = 'error';
        diagnostics.step5_hitachi_pack.message = `[${env5.toUpperCase()}] ไม่พบข้อมูลการแพ็กสินค้าใน HITACHI.PROD_DATA สำหรับลอต: ${prodLots.join(', ')}`;
      } else if (missingLotsInProd.length > 0) {
        diagnostics.step5_hitachi_pack.status = 'error';
        diagnostics.step5_hitachi_pack.message = `[${env5.toUpperCase()}] พบ Lot ที่ไม่มีข้อมูลใน HITACHI.PROD_DATA: ${missingLotsInProd.join(', ')}`;
      } else if (emptyPackRows.length > 0) {
        diagnostics.step5_hitachi_pack.status = 'error';
        diagnostics.step5_hitachi_pack.message = `[${env5.toUpperCase()}] พบแถวใน HITACHI.PROD_DATA ที่ pack_id เป็นค่าว่าง (${emptyPackRows.length} รายการ)`;
      } else {
        diagnostics.step5_hitachi_pack.status = 'success';
        diagnostics.step5_hitachi_pack.message = `[${env5.toUpperCase()}] ดึงข้อมูล Pack ID จาก HITACHI.PROD_DATA ครบถ้วน ${hitachiProdRows.length} รายการ (${packIds.length} Unique Packs)`;
      }
    } else {
      diagnostics.step5_hitachi_pack.status = 'error';
      diagnostics.step5_hitachi_pack.message = 'ไม่มีรายการ Production Lot สำหรับตรวจสอบบาร์โค้ดสายการผลิต';
    }

    // --- STEP 6: PACK HEADER & ACTIVE SHIP STATUS CHECK (HITACHI.PACK_HEADER) ---
    const t6 = Date.now();
    let hitachiHeaderRows = [];
    if (packIds.length > 0) {
      const headerSql = `
        SELECT h.pack_id, h.pack_size, h.ship_status, h.item_no, h.prod_code, h.remark, h.create_dt
        FROM HITACHI.PACK_HEADER h
        WHERE h.pack_id IN (?)
      `;
      diagnostics.step6_pack_header.sql = formatSql(headerSql, [packIds]);
      hitachiHeaderRows = await exeQueryEnv('hitachi', env6, headerSql, [packIds]);
      diagnostics.step6_pack_header.executionTime = Date.now() - t6;
      diagnostics.step6_pack_header.data = hitachiHeaderRows || [];

      const headerMap = {};
      (hitachiHeaderRows || []).forEach(r => { headerMap[r.pack_id] = r; });
      const missingPacksInHeader = packIds.filter(id => !headerMap[id]);
      const inactivePacks = (hitachiHeaderRows || []).filter(r => String(r.ship_status || '').toLowerCase() !== 'active');

      if (!hitachiHeaderRows || hitachiHeaderRows.length === 0) {
        diagnostics.step6_pack_header.status = 'error';
        diagnostics.step6_pack_header.message = `[${env6.toUpperCase()}] ไม่พบข้อมูลใน HITACHI.PACK_HEADER สำหรับ Pack ID ทั้งหมด (${packIds.length} packs)`;
      } else if (missingPacksInHeader.length > 0) {
        diagnostics.step6_pack_header.status = 'error';
        diagnostics.step6_pack_header.message = `[${env6.toUpperCase()}] พบ Pack ID ที่ไม่มีข้อมูลใน PACK_HEADER (${missingPacksInHeader.length} รายการ): ${missingPacksInHeader.join(', ')}`;
      } else if (inactivePacks.length > 0) {
        diagnostics.step6_pack_header.status = 'error';
        const inactiveDesc = inactivePacks.map(p => `${p.pack_id} (status: '${p.ship_status || 'EMPTY'}')`).join(', ');
        diagnostics.step6_pack_header.message = `[${env6.toUpperCase()}] พบ Pack ID ที่ ship_status ไม่เป็น 'Active' (${inactivePacks.length} รายการ): ${inactiveDesc}`;
      } else {
        diagnostics.step6_pack_header.status = 'success';
        diagnostics.step6_pack_header.message = `[${env6.toUpperCase()}] ข้อมูล PACK_HEADER ถูกต้องครบถ้วน ${hitachiHeaderRows.length} รายการ (สถานะ 'Active' ทั้งหมด)`;
        diagnostics.audit.totalPackQty = hitachiHeaderRows.reduce((sum, r) => sum + (parseInt(r.pack_size) || 0), 0);
      }
    } else {
      diagnostics.step6_pack_header.status = 'error';
      diagnostics.step6_pack_header.message = 'ไม่มีรหัส Pack ID จาก Step 5 สำหรับตรวจสอบใน PACK_HEADER';
    }

    // --- STEP 7: BUILD NAME / FGREC REMARK ---
    const t7 = Date.now();
    if (prodLots.length > 0) {
      const remarkSql = `
        SELECT prod_lot, remark 
        FROM WMS.HIT_FGREC_DATA 
        WHERE prod_lot IN (?)
      `;
      diagnostics.step7_build_name.sql = formatSql(remarkSql, [prodLots]);
      const remarkRows = await exeQueryEnv('wms', env7, remarkSql, [prodLots]);
      diagnostics.step7_build_name.executionTime = Date.now() - t7;
      diagnostics.step7_build_name.data = remarkRows || [];

      if (!remarkRows || remarkRows.length === 0) {
        diagnostics.step7_build_name.status = 'warning';
        diagnostics.step7_build_name.message = `[${env7.toUpperCase()}] ไม่พบบันทึกหมายเหตุ Build Name ใน WMS.HIT_FGREC_DATA (ฟิลด์ Build Name ใน CSV จะเป็นค่าว่าง)`;
      } else {
        diagnostics.step7_build_name.status = 'success';
        diagnostics.step7_build_name.message = `[${env7.toUpperCase()}] พบหมายเหตุ Build Name ${remarkRows.length} รายการ`;
      }
    }

    // --- STEP 8: ORACLE ITEM MASTER & MODEL NAME LOOKUP ---
    const t8 = Date.now();
    const firstBitPn = itemNos[0] || '';
    if (diagnostics.audit.modelUniform && firstBitPn) {
      const modelSql = `
        SELECT item_no, model_name 
        FROM MASTER.COMMON_ORACLE_ITEMMASTER_ORG 
        WHERE item_no = ? 
        LIMIT 1
      `;
      diagnostics.step8_oracle_model.sql = formatSql(modelSql, [firstBitPn]);
      const modelRows = await exeQueryEnv('wms', env8, modelSql, [firstBitPn]);
      diagnostics.step8_oracle_model.executionTime = Date.now() - t8;

      if (modelRows && modelRows.length > 0) {
        const rawName = modelRows[0].model_name || '';
        diagnostics.audit.rawModelName = rawName;
        const cutIdx = rawName.indexOf('(');
        diagnostics.audit.modelName = cutIdx !== -1 ? rawName.substring(0, cutIdx - 1).trim() : rawName.trim();
        diagnostics.step8_oracle_model.status = 'success';
        diagnostics.step8_oracle_model.message = `[${env8.toUpperCase()}] ดึงชื่อ Model Name จาก Oracle Master สำเร็จ: '${diagnostics.audit.modelName}' (Raw: '${rawName}')`;
        diagnostics.step8_oracle_model.data = modelRows[0];
      } else {
        diagnostics.step8_oracle_model.status = 'error';
        diagnostics.step8_oracle_model.message = `[${env8.toUpperCase()}] ไม่พบข้อมูล Item No '${firstBitPn}' ในตาราง MASTER.COMMON_ORACLE_ITEMMASTER_ORG`;
        diagnostics.audit.modelName = 'All';
      }
    } else {
      diagnostics.audit.modelName = 'All';
      diagnostics.step8_oracle_model.status = 'warning';
      diagnostics.step8_oracle_model.message = 'Customer PN มีหลายรายการผสมกัน (ไม่ Uniform) หรือไม่พบ Item No ระบบจะใช้ชื่อ Model เป็น "All"';
      diagnostics.step8_oracle_model.data = { model_name: 'All' };
    }

    // --- STEP 9: AUDIT QUANTITY & CSV PREVIEW SIMULATION ---
    const shipConfirmMap = {};
    (diagnostics.step4_ship_confirm.data || []).forEach(r => {
      shipConfirmMap[r.prod_lot] = r;
    });

    const headerMap = {};
    (hitachiHeaderRows || []).forEach(r => {
      headerMap[r.pack_id] = r;
    });

    const packMap = {};
    (hitachiProdRows || []).forEach(r => {
      if (!packMap[r.prod_lot]) packMap[r.prod_lot] = {};
      const hdr = headerMap[r.pack_id];
      if (hdr) {
        packMap[r.prod_lot][r.pack_id] = hdr;
      }
    });

    const remarkMap = {};
    (diagnostics.step7_build_name.data || []).forEach(r => {
      remarkMap[r.prod_lot] = r.remark || '';
    });

    const prefixInfo = diagnostics.step2_prefix.data || { ship_to: 'UNKNOWN', type: 'BPI' };
    const shipToLocation = (triggerRows[0] && triggerRows[0].ship_to_location) || 'Hub';
    const isDirect = shipToLocation === 'Direct';
    const subv = isDirect ? 'RMCOI-T2' : '';
    const shipToFilePrefix = isDirect ? 'Z0005' : 'S0005';

    // Calculate Total WMS Confirm QTY
    let calculatedTotalQty = 0;
    let sumPackQty = 0;
    const csvRows = [];

    const processedDos = new Set();
    wmsRows.forEach(row => {
      if (!processedDos.has(row.do_no)) {
        processedDos.add(row.do_no);
        calculatedTotalQty += (parseInt(row.plan_qty) || 0);
      }

      const prodLot = row.prod_lot;
      const shipData = shipConfirmMap[prodLot];
      const prodPacks = packMap[prodLot];

      if (prodPacks && shipData) {
        Object.keys(prodPacks).forEach(packId => {
          const packData = prodPacks[packId];
          const packQty = parseInt(packData.pack_size) || 0;
          sumPackQty += packQty;

          const boxId = `${row.do_no}||${parseInt(row.qty_boxs) || 0}||${cleanVal(shipData.box_ship_name)}`;
          const buildName = cleanVal(remarkMap[prodLot]);
          const shipDateStr = cleanVal(shipData.ship_date);

          csvRows.push({
            SupplierName: 'Belton',
            PartName: 'FCA',
            SHIPDATE: shipDateStr,
            INVNUM: cleanVal(row.do_no),
            TransferOrder: cleanVal(row.po_no),
            PARTNUMBER: cleanVal(row.customer_pn),
            PalletNumber: cleanVal(shipData.pallet_running),
            MODEL: cleanVal(row.model_name),
            Plt: '1',
            QTY: cleanVal(shipData.qty_pallet),
            SUBINVENTORY: subv,
            BuildName: buildName,
            ETA: '',
            Time: '',
            shipper: '',
            TruckOrAir: 'Truck',
            ShipTo: cleanVal(prefixInfo.ship_to),
            DN: '',
            Remark: '',
            BOXID: boxId,
            BOXQTY: parseInt(row.qty_boxs) || 0,
            PACKID: cleanVal(packId),
            PACKQTY: packQty,
            TRAYID: '',
            SERIAL: ''
          });
        });
      }
    });

    diagnostics.audit.totalConfirmQty = calculatedTotalQty;
    diagnostics.audit.totalPackQty = sumPackQty;
    diagnostics.audit.mismatch = (calculatedTotalQty !== sumPackQty);
    diagnostics.audit.csvRowsCount = csvRows.length;
    diagnostics.step9_audit_csv.data = csvRows;
    diagnostics.step9_audit_csv.sql = formatSql(wmsSql, [doNumber]);

    // Running counter from WMS.HIT_RUNNING_TRANSFER_CUSTOMER_FTP
    const runningSql = `SELECT running_transfer FROM WMS.HIT_RUNNING_TRANSFER_CUSTOMER_FTP LIMIT 1`;
    const runningRows = await exeQueryEnv('wms', env9, runningSql, []);
    let runningNo = 1;
    if (runningRows && runningRows.length > 0) {
      runningNo = parseInt(runningRows[0].running_transfer) || 1;
      diagnostics.audit.runningNumber = runningNo;
    }

    const paddedRunning = String(runningNo).padStart(3, '0');
    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const modelForFilename = diagnostics.audit.modelName || 'All';
    diagnostics.audit.targetFilename = `${shipToFilePrefix}_${prefixInfo.type || 'BPI'}_${todayStr}_000000_BEL_FLEX_${modelForFilename}_${paddedRunning}.csv`;

    if (diagnostics.audit.mismatch) {
      diagnostics.step9_audit_csv.status = 'error';
      diagnostics.step9_audit_csv.message = `จำนวนสินค้าไม่ตรงกัน! ยอดรวมในแผน WMS (${calculatedTotalQty} ชิ้น) ไม่เท่ากับ ยอดรวมสแกนการแพ็ก Hitachi (${sumPackQty} ชิ้น) [ส่วนต่าง: ${Math.abs(calculatedTotalQty - sumPackQty)}]`;
    } else if (csvRows.length === 0) {
      diagnostics.step9_audit_csv.status = 'error';
      diagnostics.step9_audit_csv.message = 'ไม่สามารถสร้างแถวข้อมูล CSV ได้เนื่องจากข้อมูลไม่ครบถ้วนในขั้นตอนก่อนหน้า';
    } else {
      diagnostics.step9_audit_csv.status = 'success';
      diagnostics.step9_audit_csv.message = `ตรวจสอบยอดจำนวนถูกต้องสมบูรณ์ (${calculatedTotalQty} ชิ้น) สร้างตัวอย่าง CSV ได้ ${csvRows.length} แถว`;
    }

    // --- STEP 10: SFTP CONFIGURATION & LOGGING INFO ---
    const t10 = Date.now();
    const ftpSql = `SELECT host, user, local_directory_path, remote_path FROM WMS.HIT_FTP_CONFIG LIMIT 1`;
    diagnostics.step10_sftp_config.sql = ftpSql.trim();
    const ftpRows = await exeQueryEnv('wms', env10, ftpSql, []);
    diagnostics.step10_sftp_config.executionTime = Date.now() - t10;

    if (ftpRows && ftpRows.length > 0) {
      const cfg = ftpRows[0];
      diagnostics.step10_sftp_config.data = {
        host: cfg.host,
        user: cfg.user,
        remote_path: cfg.remote_path,
        local_path: cfg.local_directory_path,
        auth_key: 'Belton.ppk (RSA Private Key)'
      };
      diagnostics.step10_sftp_config.status = 'success';
      diagnostics.step10_sftp_config.message = `[${env10.toUpperCase()}] พบการตั้งค่า SFTP Server: ${cfg.host} (User: ${cfg.user}, Path: ${cfg.remote_path})`;
    } else {
      diagnostics.step10_sftp_config.status = 'warning';
      diagnostics.step10_sftp_config.message = `[${env10.toUpperCase()}] ไม่พบการตั้งค่าใน WMS.HIT_FTP_CONFIG (จะใช้ค่า Default: sftp2.wdc.com)`;
      diagnostics.step10_sftp_config.data = {
        host: 'sftp2.wdc.com',
        user: 'Belton',
        remote_path: '/upload',
        local_path: '/var/www/html/...',
        auth_key: 'Belton.ppk'
      };
    }

    return res.json({ status: 200, data: diagnostics });
  } catch (err) {
    console.error('Error diagnosing FCA DO:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 4. Batch Diagnose All DOs for a specific date
// ============================================================================
router.post('/debug/fca/diagnose-batch', async (req, res) => {
  try {
    const { date, excludeSent = false, env = 'production' } = req.body;
    if (!date) {
      return res.status(400).json({ error: 'Date is required (YYYY-MM-DD)' });
    }

    const targetEnv = resolveEnv(env);
    const excludeClause = excludeSent
      ? 'AND s.do NOT IN (SELECT do_no FROM WMS.HIT_TRANSFER_DATA_LOG_FTP)'
      : '';

    const dosSql = `
      SELECT s.do, p.ship_to_location 
      FROM WMS.HIT_SHIP_CONFIRM s 
      INNER JOIN WMS.lrv_wms_check_confirm_log l ON s.plan_id = l.plan_id
      INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
      WHERE DATE(s.date) = ? AND s.type = 'PACK'
      ${excludeClause}
      GROUP BY s.do, p.ship_to_location
      ORDER BY s.do
    `;
    const doRows = await exeQueryEnv('wms', targetEnv, dosSql, [date]);

    if (!doRows || doRows.length === 0) {
      return res.json({
        status: 200,
        data: {
          env: targetEnv,
          totalDos: 0,
          passCount: 0,
          failCount: 0,
          results: [],
          errorBreakdown: {}
        }
      });
    }

    const batchResults = [];
    const errorBreakdown = {
      'WMS Match Not Found': 0,
      'Ship Confirm / Pallet Missing': 0,
      'Hitachi Pack Data Missing': 0,
      'Pack Header Inactive/Missing': 0,
      'Quantity Mismatch': 0,
      'Prefix Unknown/Disabled': 0,
      'Item Master Missing': 0
    };

    for (const item of doRows) {
      const doNo = item.do;
      const prefix = doNo.substring(0, 4);

      let status = 'PASS';
      let errorReason = '';
      let calculatedPlanQty = 0;

      // 1. Check WMS and retrieve unique plan QTY and production lots
      const wmsSql = `
        SELECT d.plan_id, d.do_no, p.qty as plan_qty, b.prod_lot
        FROM (WMS.SHIPMENTDO_DATA d 
              INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id)
        INNER JOIN WMS.SHIPMENTPALLET_BOX_PROD_HTC b ON d.plan_id = b.plan_id
        WHERE d.do_no = ?
      `;
      const wmsRows = await exeQueryEnv('wms', targetEnv, wmsSql, [doNo]);

      if (!wmsRows || wmsRows.length === 0) {
        status = 'FAIL';
        errorReason = 'WMS Match Not Found';
        errorBreakdown['WMS Match Not Found']++;
      } else {
        const uniquePlans = {};
        const prodLotsSet = new Set();
        wmsRows.forEach(r => {
          if (uniquePlans[r.plan_id] === undefined) {
            uniquePlans[r.plan_id] = parseInt(r.plan_qty) || 0;
          }
          if (r.prod_lot) prodLotsSet.add(r.prod_lot);
        });

        calculatedPlanQty = Object.values(uniquePlans).reduce((a, b) => a + b, 0);
        const prodLots = Array.from(prodLotsSet);

        if (prodLots.length === 0) {
          status = 'FAIL';
          errorReason = 'Ship Confirm / Pallet Missing';
          errorBreakdown['Ship Confirm / Pallet Missing']++;
        } else {
          // 2. Check Hitachi PROD_DATA
          const prodSql = `SELECT prod_lot, pack_id FROM HITACHI.PROD_DATA WHERE prod_lot IN (?)`;
          const prodRows = await exeQueryEnv('hitachi', targetEnv, prodSql, [prodLots]);

          if (!prodRows || prodRows.length === 0) {
            status = 'FAIL';
            errorReason = 'Hitachi Pack Data Missing';
            errorBreakdown['Hitachi Pack Data Missing']++;
          } else {
            const packIds = [...new Set((prodRows || []).map(r => r.pack_id).filter(Boolean))];
            
            // 3. Check PACK_HEADER existence & Active status
            const headerSql = `SELECT pack_id, pack_size, ship_status FROM HITACHI.PACK_HEADER WHERE pack_id IN (?)`;
            const headerRows = await exeQueryEnv('hitachi', targetEnv, headerSql, [packIds]);
            const headerMap = {};
            (headerRows || []).forEach(h => { headerMap[h.pack_id] = h; });

            const missingPacks = packIds.filter(id => !headerMap[id]);
            const inactivePacks = (headerRows || []).filter(h => String(h.ship_status || '').toLowerCase() !== 'active');

            if (missingPacks.length > 0 || inactivePacks.length > 0) {
              status = 'FAIL';
              errorReason = missingPacks.length > 0 ? `Pack Header Missing (${missingPacks.length})` : `Pack Inactive (${inactivePacks.length})`;
              errorBreakdown['Pack Header Inactive/Missing']++;
            } else {
              // Group unique pack_id per prod_lot
              const packMap = {};
              prodRows.forEach(r => {
                if (!packMap[r.prod_lot]) packMap[r.prod_lot] = {};
                if (headerMap[r.pack_id]) {
                  packMap[r.prod_lot][r.pack_id] = parseInt(headerMap[r.pack_id].pack_size) || 0;
                }
              });

              let totalPackSize = 0;
              Object.keys(packMap).forEach(lot => {
                Object.keys(packMap[lot]).forEach(packId => {
                  totalPackSize += packMap[lot][packId];
                });
              });

              if (calculatedPlanQty !== totalPackSize) {
                status = 'FAIL';
                errorReason = `Quantity Mismatch (Plan: ${calculatedPlanQty.toLocaleString()}, Pack: ${totalPackSize.toLocaleString()})`;
                errorBreakdown['Quantity Mismatch']++;
              }
            }
          }
        }
      }

      batchResults.push({
        do: doNo,
        ship_to_location: item.ship_to_location,
        prefix,
        status,
        errorReason,
        planQty: calculatedPlanQty
      });
    }

    const passCount = batchResults.filter(r => r.status === 'PASS').length;
    const failCount = batchResults.filter(r => r.status === 'FAIL').length;

    return res.json({
      status: 200,
      data: {
        date,
        env: targetEnv,
        totalDos: batchResults.length,
        passCount,
        failCount,
        results: batchResults,
        errorBreakdown
      }
    });
  } catch (err) {
    console.error('Error running batch diagnosis for FCA:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 5. Diagnose Single Step Manually
// ============================================================================
router.post('/debug/fca/diagnose-step', async (req, res) => {
  try {
    const { doNumber, stepNum, env = 'production' } = req.body;
    if (!doNumber) {
      return res.status(400).json({ error: 'DO number is required' });
    }
    const step = parseInt(stepNum, 10);
    if (!step || step < 1 || step > 10) {
      return res.status(400).json({ error: 'Valid stepNum (1-10) is required' });
    }

    const targetEnv = resolveEnv(env);
    const prefix = doNumber.substring(0, 4);

    let result = {
      stepNum: step,
      env: targetEnv,
      status: 'idle',
      message: '',
      sql: '',
      executionTime: 0,
      data: null
    };

    const tStart = Date.now();

    switch (step) {
      case 1: {
        const sql = `
          SELECT s.do, s.plan_id, s.pallet_no, s.date, s.type, p.ship_to_location, p.customer_pn
          FROM WMS.HIT_SHIP_CONFIRM s 
          INNER JOIN WMS.lrv_wms_check_confirm_log l ON s.plan_id = l.plan_id
          INNER JOIN WMS.SHIPMENTPLAN_DATA p ON s.plan_id = p.plan_id 
          WHERE s.do = ? AND s.type = 'PACK'
          LIMIT 10
        `;
        result.sql = formatSql(sql, [doNumber]);
        const rows = await exeQueryEnv('wms', targetEnv, sql, [doNumber]);
        result.executionTime = Date.now() - tStart;
        result.data = rows || [];
        if (!rows || rows.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบข้อมูลการยืนยันจัดส่ง (type='PACK') สำหรับ DO: ${doNumber}`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] พบข้อมูลยืนยันการส่งมอบเริ่มต้นสำหรับ DO: ${doNumber} (${rows.length} แถว)`;
        }
        break;
      }
      case 2: {
        const sql = `SELECT prefix, ship_to, type, status FROM WMS.HIT_SHIP_TO_MASTER WHERE prefix = ? AND status = 'active'`;
        result.sql = formatSql(sql, [prefix]);
        const rows = await exeQueryEnv('wms', targetEnv, sql, [prefix]);
        result.executionTime = Date.now() - tStart;
        if (!rows || rows.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบการตั้งค่า Prefix '${prefix}' ใน WMS.HIT_SHIP_TO_MASTER (หรือสถานะไม่ได้เป็น active)`;
          result.data = { prefix, ship_to: 'UNKNOWN', type: 'UNKNOWN', status: 'missing' };
        } else {
          const info = rows[0];
          result.data = info;
          if (info.type === 'PRB') {
            result.status = 'warning';
            result.message = `[${targetEnv.toUpperCase()}] Prefix '${prefix}' เป็นประเภท PRB (ถูก Disabled ในระบบ FCA)`;
          } else {
            result.status = 'success';
            result.message = `[${targetEnv.toUpperCase()}] Prefix '${prefix}' เป็นประเภท '${info.type}' จัดส่งไปยัง '${info.ship_to}'`;
          }
        }
        break;
      }
      case 3: {
        const sql = `
          SELECT d.plan_id, d.do_no, p.customer_pn, p.item_no, p.model_name, p.qty as plan_qty, 
                 b.store_lot, b.prod_lot, b.qty as qty_boxs, p.po_no
          FROM (WMS.SHIPMENTDO_DATA d 
                INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id)
          INNER JOIN WMS.SHIPMENTPALLET_BOX_PROD_HTC b ON d.plan_id = b.plan_id
          WHERE d.do_no = ?
          ORDER BY d.do_no, b.store_lot, b.prod_lot
        `;
        result.sql = formatSql(sql, [doNumber]);
        const rows = await exeQueryEnv('wms', targetEnv, sql, [doNumber]);
        result.executionTime = Date.now() - tStart;
        result.data = rows || [];
        if (!rows || rows.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบข้อมูลแผนงานจัดส่งหรือพาเลทกล่องใน WMS สำหรับ DO: ${doNumber}`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] ดึงข้อมูลการเชื่อมโยงชิ้นงาน WMS สำเร็จ (${rows.length} รายการ)`;
        }
        break;
      }
      case 4: {
        const lotsSql = `
          SELECT DISTINCT b.prod_lot 
          FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC b
          INNER JOIN WMS.SHIPMENTDO_DATA d ON b.plan_id = d.plan_id
          WHERE d.do_no = ? AND b.prod_lot IS NOT NULL AND b.prod_lot != ''
        `;
        const lotRows = await exeQueryEnv('wms', targetEnv, lotsSql, [doNumber]);
        const prodLots = (lotRows || []).map(r => r.prod_lot);
        if (prodLots.length === 0) {
          result.status = 'error';
          result.message = 'ไม่พบรหัส Production Lot จาก WMS สำหรับตรวจสอบพาเลท';
          break;
        }

        const sql = `
          SELECT s.pallet_no as pallet_running, s.box_detail, 
                 DATE_FORMAT(s.date, '%d-%M-%Y') as ship_date, 
                 d.qty_pallet, s.prod_lot, s.box_ship_name
        FROM WMS.HIT_SHIP_CONFIRM AS s
        INNER JOIN WMS.HIT_PALLET_DATA d ON s.pallet_no = d.running_pallet
        WHERE s.prod_lot IN (?)
          AND s.type = 'pack' 
          AND d.status = 'Active'
        `;
        result.sql = formatSql(sql, [prodLots]);
        const rows = await exeQueryEnv('wms', targetEnv, sql, [prodLots]);
        result.executionTime = Date.now() - tStart;
        result.data = rows || [];
        if (!rows || rows.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบข้อมูลยืนยันการจัดส่งพาเลทใน WMS.HIT_SHIP_CONFIRM / HIT_PALLET_DATA สำหรับลอต: ${prodLots.join(', ')}`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] พบข้อมูลยืนยันพาเลทสำเร็จ (${rows.length} รายการ)`;
        }
        break;
      }
      case 5: {
        const lotsSql = `
          SELECT DISTINCT b.prod_lot 
          FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC b
          INNER JOIN WMS.SHIPMENTDO_DATA d ON b.plan_id = d.plan_id
          WHERE d.do_no = ? AND b.prod_lot IS NOT NULL AND b.prod_lot != ''
        `;
        const lotRows = await exeQueryEnv('wms', targetEnv, lotsSql, [doNumber]);
        const prodLots = (lotRows || []).map(r => r.prod_lot);
        if (prodLots.length === 0) {
          result.status = 'error';
          result.message = 'ไม่พบรหัส Production Lot จาก WMS สำหรับสืบค้นใน Hitachi DB';
          break;
        }

        const sql = `
          SELECT p.prod_lot, p.pack_id 
          FROM HITACHI.PROD_DATA p
          WHERE p.prod_lot IN (?)
        `;
        result.sql = formatSql(sql, [prodLots]);
        const rows = await exeQueryEnv('hitachi', targetEnv, sql, [prodLots]);
        result.executionTime = Date.now() - tStart;
        result.data = rows || [];

        const foundLots = new Set((rows || []).map(r => r.prod_lot).filter(Boolean));
        const missingLots = prodLots.filter(l => !foundLots.has(l));
        const emptyPacks = (rows || []).filter(r => !r.pack_id || String(r.pack_id).trim() === '');
        const uniquePacks = [...new Set((rows || []).map(r => r.pack_id).filter(Boolean))];

        if (!rows || rows.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบข้อมูลการแพ็กสินค้าในฐานข้อมูลฝั่งผลิต (HITACHI.PROD_DATA) สำหรับลอต: ${prodLots.join(', ')}`;
        } else if (missingLots.length > 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] พบ Lot ที่ไม่มีข้อมูลใน HITACHI.PROD_DATA: ${missingLots.join(', ')}`;
        } else if (emptyPacks.length > 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] พบแถวใน HITACHI.PROD_DATA ที่ pack_id เป็นค่าว่าง (${emptyPacks.length} รายการ)`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] ดึงข้อมูล Pack ID จาก HITACHI.PROD_DATA ครบถ้วน (${rows.length} แถว, ${uniquePacks.length} Unique Packs)`;
        }
        break;
      }
      case 6: {
        // Step 6: Verify PACK_HEADER existence & Active status
        const lotsSql = `
          SELECT DISTINCT b.prod_lot 
          FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC b
          INNER JOIN WMS.SHIPMENTDO_DATA d ON b.plan_id = d.plan_id
          WHERE d.do_no = ? AND b.prod_lot IS NOT NULL AND b.prod_lot != ''
        `;
        const lotRows = await exeQueryEnv('wms', targetEnv, lotsSql, [doNumber]);
        const prodLots = (lotRows || []).map(r => r.prod_lot);
        if (prodLots.length === 0) {
          result.status = 'error';
          result.message = 'ไม่พบรหัส Production Lot จาก WMS สำหรับสืบค้นใน Hitachi DB';
          break;
        }

        const prodRows = await exeQueryEnv('hitachi', targetEnv, `SELECT pack_id FROM HITACHI.PROD_DATA WHERE prod_lot IN (?)`, [prodLots]);
        const packIds = [...new Set((prodRows || []).map(r => r.pack_id).filter(Boolean))];

        if (packIds.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบรหัส Pack ID ใน HITACHI.PROD_DATA เพื่อนำมาตรวจสอบใน PACK_HEADER`;
          break;
        }

        const sql = `
          SELECT h.pack_id, h.pack_size, h.ship_status, h.item_no, h.prod_code, h.remark, h.create_dt
          FROM HITACHI.PACK_HEADER h
          WHERE h.pack_id IN (?)
        `;
        result.sql = formatSql(sql, [packIds]);
        const rows = await exeQueryEnv('hitachi', targetEnv, sql, [packIds]);
        result.executionTime = Date.now() - tStart;
        result.data = rows || [];

        const headerMap = {};
        (rows || []).forEach(r => { headerMap[r.pack_id] = r; });
        const missingPacks = packIds.filter(id => !headerMap[id]);
        const inactivePacks = (rows || []).filter(r => String(r.ship_status || '').toLowerCase() !== 'active');

        if (!rows || rows.length === 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบข้อมูลใน HITACHI.PACK_HEADER สำหรับ Pack ID ทั้งหมด (${packIds.length} packs)`;
        } else if (missingPacks.length > 0) {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] พบ Pack ID ที่ไม่มีข้อมูลใน PACK_HEADER (${missingPacks.length} รายการ): ${missingPacks.join(', ')}`;
        } else if (inactivePacks.length > 0) {
          result.status = 'error';
          const inactiveDesc = inactivePacks.map(p => `${p.pack_id} (status: '${p.ship_status || 'EMPTY'}')`).join(', ');
          result.message = `[${targetEnv.toUpperCase()}] พบ Pack ID ที่ ship_status ไม่เป็น 'Active' (${inactivePacks.length} รายการ): ${inactiveDesc}`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] ข้อมูล PACK_HEADER ถูกต้องครบถ้วน (${rows.length} รายการ, สถานะ 'Active' ทั้งหมด)`;
        }
        break;
      }
      case 7: {
        const lotsSql = `
          SELECT DISTINCT b.prod_lot 
          FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC b
          INNER JOIN WMS.SHIPMENTDO_DATA d ON b.plan_id = d.plan_id
          WHERE d.do_no = ? AND b.prod_lot IS NOT NULL AND b.prod_lot != ''
        `;
        const lotRows = await exeQueryEnv('wms', targetEnv, lotsSql, [doNumber]);
        const prodLots = (lotRows || []).map(r => r.prod_lot);
        if (prodLots.length === 0) {
          result.status = 'error';
          result.message = 'ไม่พบรหัส Production Lot จาก WMS สำหรับดึง Build Name';
          break;
        }

        const sql = `SELECT prod_lot, remark FROM WMS.HIT_FGREC_DATA WHERE prod_lot IN (?)`;
        result.sql = formatSql(sql, [prodLots]);
        const rows = await exeQueryEnv('wms', targetEnv, sql, [prodLots]);
        result.executionTime = Date.now() - tStart;
        result.data = rows || [];
        if (!rows || rows.length === 0) {
          result.status = 'warning';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบบันทึกหมายเหตุ Build Name ใน WMS.HIT_FGREC_DATA (ฟิลด์ Build Name ใน CSV จะเป็นค่าว่าง)`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] พบหมายเหตุ Build Name ${rows.length} รายการ`;
        }
        break;
      }
      case 8: {
        const itemSql = `
          SELECT DISTINCT p.item_no, p.customer_pn
          FROM WMS.SHIPMENTDO_DATA d 
          INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id
          WHERE d.do_no = ?
        `;
        const itemRows = await exeQueryEnv('wms', targetEnv, itemSql, [doNumber]);
        const itemNo = (itemRows && itemRows[0] && itemRows[0].item_no) || '';
        if (!itemNo) {
          result.status = 'warning';
          result.message = 'ไม่พบรหัส Item No (Bit PN) จากแผนงานจัดส่ง ระบบจะใช้ Model Name เป็น "All"';
          result.data = { item_no: '', model_name: 'All' };
          break;
        }

        const sql = `SELECT item_no, model_name FROM MASTER.COMMON_ORACLE_ITEMMASTER_ORG WHERE item_no = ? LIMIT 1`;
        result.sql = formatSql(sql, [itemNo]);
        const rows = await exeQueryEnv('wms', targetEnv, sql, [itemNo]);
        result.executionTime = Date.now() - tStart;
        if (rows && rows.length > 0) {
          const rawName = rows[0].model_name || '';
          const cutIdx = rawName.indexOf('(');
          const cleanModel = cutIdx !== -1 ? rawName.substring(0, cutIdx - 1).trim() : rawName.trim();
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] ดึงชื่อ Model Name จาก Oracle Master สำเร็จ: '${cleanModel}' (Raw: '${rawName}')`;
          result.data = { item_no: itemNo, raw_model_name: rawName, model_name: cleanModel };
        } else {
          result.status = 'error';
          result.message = `[${targetEnv.toUpperCase()}] ไม่พบข้อมูล Item No '${itemNo}' ในตาราง MASTER.COMMON_ORACLE_ITEMMASTER_ORG`;
          result.data = { item_no: itemNo, model_name: 'All' };
        }
        break;
      }
      case 9: {
        // Step 9: Build rows directly
        const wmsSql = `
          SELECT d.plan_id, d.do_no, p.customer_pn, p.item_no, p.model_name, p.qty as plan_qty, 
                 b.store_lot, b.prod_lot, b.qty as qty_boxs, p.po_no
          FROM (WMS.SHIPMENTDO_DATA d 
                INNER JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id)
          INNER JOIN WMS.SHIPMENTPALLET_BOX_PROD_HTC b ON d.plan_id = b.plan_id
          WHERE d.do_no = ?
        `;
        result.sql = formatSql(wmsSql, [doNumber]);
        const wmsRows = await exeQueryEnv('wms', targetEnv, wmsSql, [doNumber]);
        const prodLots = [...new Set((wmsRows || []).map(r => r.prod_lot).filter(Boolean))];

        let shipRows = [];
        let prodPackRows = [];
        let headerRows = [];
        let remarkRows = [];

        if (prodLots.length > 0) {
          shipRows = await exeQueryEnv('wms', targetEnv, `
            SELECT s.pallet_no as pallet_running, s.box_detail, DATE_FORMAT(s.date, '%d-%M-%Y') as ship_date, 
                   d.qty_pallet, s.prod_lot, s.box_ship_name
            FROM WMS.HIT_SHIP_CONFIRM AS s
            INNER JOIN WMS.HIT_PALLET_DATA d ON s.pallet_no = d.running_pallet
            WHERE s.prod_lot IN (?) AND s.type = 'pack' AND d.status = 'Active'
          `, [prodLots]) || [];

          prodPackRows = await exeQueryEnv('hitachi', targetEnv, `
            SELECT prod_lot, pack_id FROM HITACHI.PROD_DATA WHERE prod_lot IN (?)
          `, [prodLots]) || [];

          const packIds = [...new Set((prodPackRows || []).map(r => r.pack_id).filter(Boolean))];
          if (packIds.length > 0) {
            headerRows = await exeQueryEnv('hitachi', targetEnv, `
              SELECT pack_id, pack_size, ship_status FROM HITACHI.PACK_HEADER WHERE pack_id IN (?)
            `, [packIds]) || [];
          }

          remarkRows = await exeQueryEnv('wms', targetEnv, `
            SELECT prod_lot, remark FROM WMS.HIT_FGREC_DATA WHERE prod_lot IN (?)
          `, [prodLots]) || [];
        }

        const shipConfirmMap = {};
        shipRows.forEach(r => { shipConfirmMap[r.prod_lot] = r; });
        const headerMap = {};
        headerRows.forEach(r => { headerMap[r.pack_id] = r; });
        const packMap = {};
        prodPackRows.forEach(r => {
          if (!packMap[r.prod_lot]) packMap[r.prod_lot] = {};
          if (headerMap[r.pack_id]) {
            packMap[r.prod_lot][r.pack_id] = headerMap[r.pack_id];
          }
        });
        const remarkMap = {};
        remarkRows.forEach(r => { remarkMap[r.prod_lot] = r.remark || ''; });

        const csvRows = [];
        (wmsRows || []).forEach(row => {
          const prodLot = row.prod_lot;
          const shipData = shipConfirmMap[prodLot];
          const prodPacks = packMap[prodLot];
          if (prodPacks && shipData) {
            Object.keys(prodPacks).forEach(packId => {
              const packData = prodPacks[packId];
              csvRows.push({
                SupplierName: 'Belton',
                PartName: 'FCA',
                SHIPDATE: cleanVal(shipData.ship_date),
                INVNUM: cleanVal(row.do_no),
                TransferOrder: cleanVal(row.po_no),
                PARTNUMBER: cleanVal(row.customer_pn),
                PalletNumber: cleanVal(shipData.pallet_running),
                MODEL: cleanVal(row.model_name),
                Plt: '1',
                QTY: cleanVal(shipData.qty_pallet),
                SUBINVENTORY: '',
                BuildName: cleanVal(remarkMap[prodLot]),
                ETA: '',
                Time: '',
                shipper: '',
                TruckOrAir: 'Truck',
                ShipTo: 'VMI-Hub',
                DN: '',
                Remark: '',
                BOXID: `${row.do_no}||${parseInt(row.qty_boxs) || 0}||${cleanVal(shipData.box_ship_name)}`,
                BOXQTY: parseInt(row.qty_boxs) || 0,
                PACKID: cleanVal(packId),
                PACKQTY: parseInt(packData.pack_size) || 0,
                TRAYID: '',
                SERIAL: ''
              });
            });
          }
        });

        result.executionTime = Date.now() - tStart;
        result.data = csvRows;
        result.status = csvRows.length > 0 ? 'success' : 'error';
        result.message = `[${targetEnv.toUpperCase()}] จำลองแถวข้อมูล CSV 25 Columns สำเร็จทั้งหมด ${csvRows.length} แถว`;
        break;
      }
      case 10: {
        const configSql = `SELECT host, user, local_directory_path, remote_path FROM WMS.HIT_FTP_CONFIG LIMIT 1`;
        const logSql = `SELECT do_no, dt_do_transfer FROM WMS.HIT_TRANSFER_DATA_LOG_FTP WHERE do_no = ?`;
        result.sql = `${configSql}\n\n${formatSql(logSql, [doNumber])}`;

        const configRows = await exeQueryEnv('wms', targetEnv, configSql, []);
        const logRows = await exeQueryEnv('wms', targetEnv, logSql, [doNumber]);
        result.executionTime = Date.now() - tStart;

        const isSentAlready = (logRows && logRows.length > 0);
        result.data = {
          config: (configRows && configRows[0]) || {},
          alreadySent: isSentAlready,
          transferHistory: logRows || []
        };

        if (isSentAlready) {
          result.status = 'warning';
          result.message = `[${targetEnv.toUpperCase()}] DO นี้เคยถูกส่งขึ้น SFTP แล้วเมื่อ: ${logRows[0].dt_do_transfer} (หากส่งซ้ำในระบบจริงจะถูกข้ามโดยเงื่อนไข Log)`;
        } else {
          result.status = 'success';
          result.message = `[${targetEnv.toUpperCase()}] พร้อมส่ง SFTP (ไม่เคยมีประวัติการส่ง DO นี้ใน Log) Config SFTP สมบูรณ์`;
        }
        break;
      }
    }

    return res.json({ status: 200, data: result });
  } catch (err) {
    console.error('Error running single step diagnosis:', err);
    return res.status(500).json({ error: err.message });
  }
});

// Helper to clone rows safely into destination table
async function cloneTableRows(sourcePool, destPool, tableName, selectSql, selectParams) {
  let srcConn, destConn;
  try {
    srcConn = await sourcePool.getConnection();
    const [rows] = await srcConn.query(selectSql, selectParams);
    if (!rows || rows.length === 0) return { table: tableName, count: 0 };

    destConn = await destPool.getConnection();
    let count = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = Object.values(row);
      const placeholders = cols.map(() => '?').join(', ');
      const updateClause = cols.map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
      const insertSql = `INSERT INTO ${tableName} (\`${cols.join('`, `')}\`) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateClause}`;
      await destConn.query(insertSql, vals);
      count++;
    }
    return { table: tableName, count: count };
  } catch (err) {
    console.error(`Error cloning ${tableName}:`, err.message);
    return { table: tableName, count: 0, error: err.message };
  } finally {
    if (srcConn) srcConn.release();
    if (destConn) destConn.release();
  }
}

// ============================================================================
// 4. Preview DO Data for Cloning (Production -> Development)
// ============================================================================
router.post('/debug/fca/clone-preview', async (req, res) => {
  try {
    const { doNumber } = req.body;
    if (!doNumber) return res.status(400).json({ error: 'กรุณาระบุเลข DO' });

    const prefix = doNumber.substring(0, 4);
    let srcConn, hitSrcConn;
    try {
      srcConn = await DB_PROD_WMS.getConnection();

      // 1. SHIPMENTDO_DATA
      const [doRows] = await srcConn.query('SELECT * FROM WMS.SHIPMENTDO_DATA WHERE do_no = ?', [doNumber]);
      const doCount = (doRows || []).length;
      const planIds = [...new Set((doRows || []).map(r => r.plan_id).filter(Boolean))];

      let planRows = [], logRows = [], boxRows = [], itemNos = [], prodLots = [];
      if (planIds.length > 0) {
        [planRows] = await srcConn.query('SELECT * FROM WMS.SHIPMENTPLAN_DATA WHERE plan_id IN (?)', [planIds]);
        itemNos = [...new Set((planRows || []).map(r => r.item_no).filter(Boolean))];

        [logRows] = await srcConn.query('SELECT * FROM WMS.lrv_wms_check_confirm_log WHERE plan_id IN (?)', [planIds]);

        [boxRows] = await srcConn.query('SELECT * FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC WHERE plan_id IN (?)', [planIds]);
        prodLots = [...new Set((boxRows || []).map(r => r.prod_lot).filter(Boolean))];
      }

      let shipRows = [], palletRows = [], fgRows = [], hitRows = [], packRows = [];
      if (prodLots.length > 0) {
        [shipRows] = await srcConn.query('SELECT * FROM WMS.HIT_SHIP_CONFIRM WHERE do = ? OR prod_lot IN (?)', [doNumber, prodLots]);
        const palletNos = [...new Set((shipRows || []).map(r => r.pallet_no).filter(Boolean))];

        if (palletNos.length > 0) {
          [palletRows] = await srcConn.query('SELECT * FROM WMS.HIT_PALLET_DATA WHERE running_pallet IN (?)', [palletNos]);
        }

        [fgRows] = await srcConn.query('SELECT * FROM WMS.HIT_FGREC_DATA WHERE prod_lot IN (?)', [prodLots]);

        try {
          hitSrcConn = await DB_PROD_HITACHI.getConnection();
          [hitRows] = await hitSrcConn.query('SELECT * FROM HITACHI.PROD_DATA WHERE prod_lot IN (?)', [prodLots]);
          const packIds = [...new Set((hitRows || []).map(r => r.pack_id).filter(Boolean))];
          if (packIds.length > 0) {
            [packRows] = await hitSrcConn.query('SELECT * FROM HITACHI.PACK_HEADER WHERE pack_id IN (?)', [packIds]);
          }
        } catch (e) {
          console.error('Hitachi preview error:', e.message);
        } finally {
          if (hitSrcConn) hitSrcConn.release();
        }
      }

      let oracleRows = [];
      if (itemNos.length > 0) {
        [oracleRows] = await srcConn.query('SELECT * FROM MASTER.COMMON_ORACLE_ITEMMASTER_ORG WHERE item_no IN (?)', [itemNos]);
      }

      const [prefixRows] = await srcConn.query('SELECT * FROM WMS.HIT_SHIP_TO_MASTER WHERE prefix = ?', [prefix]);

      const preview = {
        'WMS.SHIPMENTDO_DATA': (doRows || []).length,
        'WMS.HIT_SHIP_TO_MASTER': (prefixRows || []).length,
        'WMS.SHIPMENTPLAN_DATA': (planRows || []).length,
        'WMS.lrv_wms_check_confirm_log': (logRows || []).length,
        'MASTER.COMMON_ORACLE_ITEMMASTER_ORG': (oracleRows || []).length,
        'WMS.SHIPMENTPALLET_BOX_PROD_HTC': (boxRows || []).length,
        'WMS.HIT_FGREC_DATA': (fgRows || []).length,
        'WMS.HIT_SHIP_CONFIRM': (shipRows || []).length,
        'WMS.HIT_PALLET_DATA': (palletRows || []).length,
        'HITACHI.PROD_DATA': (hitRows || []).length,
        'HITACHI.PACK_HEADER': (packRows || []).length
      };

      const previewRows = {
        'WMS.SHIPMENTDO_DATA': doRows || [],
        'WMS.HIT_SHIP_TO_MASTER': prefixRows || [],
        'WMS.SHIPMENTPLAN_DATA': planRows || [],
        'WMS.lrv_wms_check_confirm_log': logRows || [],
        'MASTER.COMMON_ORACLE_ITEMMASTER_ORG': oracleRows || [],
        'WMS.SHIPMENTPALLET_BOX_PROD_HTC': boxRows || [],
        'WMS.HIT_FGREC_DATA': fgRows || [],
        'WMS.HIT_SHIP_CONFIRM': shipRows || [],
        'WMS.HIT_PALLET_DATA': palletRows || [],
        'HITACHI.PROD_DATA': hitRows || [],
        'HITACHI.PACK_HEADER': packRows || []
      };

      const totalPreviewRows = Object.values(preview).reduce((a, b) => a + b, 0);

      return res.json({
        status: 200,
        data: {
          doNumber,
          totalPreviewRows,
          preview,
          previewRows
        }
      });
    } finally {
      if (srcConn) srcConn.release();
    }
  } catch (err) {
    console.error('Clone preview error:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// 5. Clone DO Data from Production to Development ONLY
// ============================================================================
router.post('/debug/fca/clone-to-dev', async (req, res) => {
  try {
    const { doNumber, sourceEnv = 'production' } = req.body;
    if (!doNumber) {
      return res.status(400).json({ error: 'กรุณาระบุเลข DO' });
    }

    if (sourceEnv === 'development' || sourceEnv === 'dev') {
      return res.status(400).json({ 
        error: 'ไม่อนุญาตให้ Clone ข้อมูลจาก Development ไปยัง Production (อนุญาตเฉพาะ Production -> Development เท่านั้น เพื่อความปลอดภัยของฐานข้อมูลจริง)' 
      });
    }

    const tStart = Date.now();
    const prefix = doNumber.substring(0, 4);
    const stats = [];

    let srcConn;
    try {
      srcConn = await DB_PROD_WMS.getConnection();

      // 1. SHIPMENTDO_DATA
      const r1 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.SHIPMENTDO_DATA', 'SELECT * FROM WMS.SHIPMENTDO_DATA WHERE do_no = ?', [doNumber]);
      stats.push(r1);

      // Get plan IDs
      const [doRows] = await srcConn.query('SELECT plan_id FROM WMS.SHIPMENTDO_DATA WHERE do_no = ?', [doNumber]);
      const planIds = [...new Set((doRows || []).map(r => r.plan_id).filter(Boolean))];

      if (planIds.length > 0) {
        // 2. SHIPMENTPLAN_DATA
        const r2 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.SHIPMENTPLAN_DATA', 'SELECT * FROM WMS.SHIPMENTPLAN_DATA WHERE plan_id IN (?)', [planIds]);
        stats.push(r2);

        // 3. lrv_wms_check_confirm_log
        const r3 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.lrv_wms_check_confirm_log', 'SELECT * FROM WMS.lrv_wms_check_confirm_log WHERE plan_id IN (?)', [planIds]);
        stats.push(r3);

        // 4. SHIPMENTPALLET_BOX_PROD_HTC
        const r4 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.SHIPMENTPALLET_BOX_PROD_HTC', 'SELECT * FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC WHERE plan_id IN (?)', [planIds]);
        stats.push(r4);

        // Get prod lots & item numbers
        const [boxRows] = await srcConn.query('SELECT prod_lot FROM WMS.SHIPMENTPALLET_BOX_PROD_HTC WHERE plan_id IN (?)', [planIds]);
        const prodLots = [...new Set((boxRows || []).map(r => r.prod_lot).filter(Boolean))];

        const [planRows] = await srcConn.query('SELECT item_no FROM WMS.SHIPMENTPLAN_DATA WHERE plan_id IN (?)', [planIds]);
        const itemNos = [...new Set((planRows || []).map(r => r.item_no).filter(Boolean))];

        if (prodLots.length > 0) {
          // 5. HIT_SHIP_CONFIRM
          const r5 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.HIT_SHIP_CONFIRM', 'SELECT * FROM WMS.HIT_SHIP_CONFIRM WHERE do = ? OR prod_lot IN (?)', [doNumber, prodLots]);
          stats.push(r5);

          // Get pallet nos
          const [shipRows] = await srcConn.query('SELECT pallet_no FROM WMS.HIT_SHIP_CONFIRM WHERE do = ? OR prod_lot IN (?)', [doNumber, prodLots]);
          const palletNos = [...new Set((shipRows || []).map(r => r.pallet_no).filter(Boolean))];

          if (palletNos.length > 0) {
            // 6. HIT_PALLET_DATA
            const r6 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.HIT_PALLET_DATA', 'SELECT * FROM WMS.HIT_PALLET_DATA WHERE running_pallet IN (?)', [palletNos]);
            stats.push(r6);
          }

          // 7. HIT_FGREC_DATA
          const r7 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.HIT_FGREC_DATA', 'SELECT * FROM WMS.HIT_FGREC_DATA WHERE prod_lot IN (?)', [prodLots]);
          stats.push(r7);

          // 8. HITACHI PROD_DATA & PACK_HEADER
          let hitSrcConn;
          try {
            hitSrcConn = await DB_PROD_HITACHI.getConnection();
            const r8 = await cloneTableRows(DB_PROD_HITACHI, DB_DEV_HITACHI, 'HITACHI.PROD_DATA', 'SELECT * FROM HITACHI.PROD_DATA WHERE prod_lot IN (?)', [prodLots]);
            stats.push(r8);

            const [hitRows] = await hitSrcConn.query('SELECT pack_id FROM HITACHI.PROD_DATA WHERE prod_lot IN (?)', [prodLots]);
            const packIds = [...new Set((hitRows || []).map(r => r.pack_id).filter(Boolean))];
            if (packIds.length > 0) {
              const r9 = await cloneTableRows(DB_PROD_HITACHI, DB_DEV_HITACHI, 'HITACHI.PACK_HEADER', 'SELECT * FROM HITACHI.PACK_HEADER WHERE pack_id IN (?)', [packIds]);
              stats.push(r9);
            }
          } catch (e) {
            console.error('Hitachi clone error:', e.message);
          } finally {
            if (hitSrcConn) hitSrcConn.release();
          }
        }

        if (itemNos.length > 0) {
          // 9. COMMON_ORACLE_ITEMMASTER_ORG
          const r10 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'MASTER.COMMON_ORACLE_ITEMMASTER_ORG', 'SELECT * FROM MASTER.COMMON_ORACLE_ITEMMASTER_ORG WHERE item_no IN (?)', [itemNos]);
          stats.push(r10);
        }
      }

      // 10. HIT_SHIP_TO_MASTER
      const r11 = await cloneTableRows(DB_PROD_WMS, DB_DEV_WMS, 'WMS.HIT_SHIP_TO_MASTER', 'SELECT * FROM WMS.HIT_SHIP_TO_MASTER WHERE prefix = ?', [prefix]);
      stats.push(r11);

      const totalRowsCloned = stats.reduce((sum, s) => sum + (s.count || 0), 0);
      const executionTime = Date.now() - tStart;

      return res.json({
        status: 200,
        message: `Clone ข้อมูล DO: ${doNumber} ไปยัง Development (BITINTRADEV) สำเร็จเรียบร้อย (${totalRowsCloned} แถว ใน ${executionTime}ms)`,
        data: {
          doNumber,
          totalRowsCloned,
          executionTime,
          stats
        }
      });
    } finally {
      if (srcConn) srcConn.release();
    }
  } catch (err) {
    console.error('Clone to dev error:', err);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
