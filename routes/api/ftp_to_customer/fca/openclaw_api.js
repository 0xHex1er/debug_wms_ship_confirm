const express = require('express');
const router = express.Router();
const axios = require('axios');
const { exeQueryEnv } = require('../../../../config/db.js');

// Default Open Claw Base URL
const DEFAULT_OPENCLAW_URL = process.env.OPENCLAW_BASE_URL || 'https://openclaw-th.beltontechnology.com';

/**
 * Helper to resolve Open Claw auth token/cookie from environment
 */
const getOpenClawToken = () => {
  return process.env.OPENCLAW_AUTH_COOKIE || '';
};

/**
 * Query live database records for a given DO with explicit connection tracking
 */
const fetchLiveDoContext = async (doNumber, env = 'production') => {
  if (!doNumber) return null;
  const cleanDo = String(doNumber).trim().toUpperCase();
  const targetEnv = (env === 'development' || env === 'dev') ? 'development' : 'production';
  const connectionName = targetEnv === 'development' ? 'Development (BITINTRADEV)' : 'Production (BITINTRA_REAL)';
  const prefix = cleanDo.substring(0, 4);

  const result = {
    do: cleanDo,
    env: targetEnv,
    connectionName: connectionName,
    hitShipConfirmCount: 0,
    packRows: [],
    shipBoxRows: [],
    packSummary: { count: 0, totalQty: 0, distinctPallets: [], distinctDates: [] },
    shipBoxSummary: { count: 0, totalQty: 0 },
    planData: [],
    logFtp: [],
    prefixMaster: [],
    otherEnvCheck: null
  };

  try {
    // 1. Query WMS.HIT_SHIP_CONFIRM for DO rows
    const confirmSql = `
      SELECT id, plan_id, do, pallet, box, box_ship_name, qty, type, store_lot, prod_lot, pallet_no, date
      FROM WMS.HIT_SHIP_CONFIRM
      WHERE do = ?
      ORDER BY id ASC
      LIMIT 100
    `;
    const confirmRows = await exeQueryEnv('wms', targetEnv, confirmSql, [cleanDo]);
    const allRows = confirmRows || [];
    result.hitShipConfirmCount = allRows.length;

    const packRows = allRows.filter(r => String(r.type || '').toUpperCase() === 'PACK');
    const shipBoxRows = allRows.filter(r => String(r.type || '').toUpperCase() === 'SHIP BOX');

    result.packRows = packRows.slice(0, 20);
    result.shipBoxRows = shipBoxRows.slice(0, 10);

    result.packSummary = {
      count: packRows.length,
      totalQty: packRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0),
      distinctPallets: [...new Set(packRows.map(r => r.pallet_no).filter(Boolean))],
      distinctDates: [...new Set(packRows.map(r => {
        if (!r.date) return null;
        try {
          const d = new Date(r.date);
          return isNaN(d.getTime()) ? String(r.date) : d.toISOString().replace('T', ' ').substring(0, 19);
        } catch (e) {
          return String(r.date);
        }
      }).filter(Boolean))]
    };

    result.shipBoxSummary = {
      count: shipBoxRows.length,
      totalQty: shipBoxRows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0)
    };

    // 2. Query WMS.SHIPMENTPLAN_DATA / SHIPMENTDO_DATA
    const planSql = `
      SELECT d.do_no, d.plan_id, p.item_no, p.model_name, p.customer_pn, p.qty as plan_qty, p.po_no, p.ship_to_location
      FROM WMS.SHIPMENTDO_DATA d
      LEFT JOIN WMS.SHIPMENTPLAN_DATA p ON d.plan_id = p.plan_id
      WHERE d.do_no = ?
      LIMIT 10
    `;
    const planRows = await exeQueryEnv('wms', targetEnv, planSql, [cleanDo]);
    result.planData = planRows || [];

    // 3. Query WMS.HIT_TRANSFER_DATA_LOG_FTP (Transfer history)
    const logSql = `
      SELECT *
      FROM WMS.HIT_TRANSFER_DATA_LOG_FTP
      WHERE do_no = ?
      ORDER BY dt_do_transfer DESC
      LIMIT 10
    `;
    const logRows = await exeQueryEnv('wms', targetEnv, logSql, [cleanDo]);
    result.logFtp = logRows || [];

    // 4. Query WMS.HIT_SHIP_TO_MASTER
    const prefixSql = `
      SELECT prefix, ship_to, type, status
      FROM WMS.HIT_SHIP_TO_MASTER
      WHERE prefix = ?
      LIMIT 5
    `;
    const prefixRows = await exeQueryEnv('wms', targetEnv, prefixSql, [prefix]);
    result.prefixMaster = prefixRows || [];

    // 5. If 0 rows found in targetEnv, cross-check other environment for helpful diagnostic
    if (result.hitShipConfirmCount === 0) {
      try {
        const otherEnv = targetEnv === 'development' ? 'production' : 'development';
        const otherDbName = otherEnv === 'development' ? 'Development (BITINTRADEV)' : 'Production (BITINTRA_REAL)';
        const otherCheckRows = await exeQueryEnv('wms', otherEnv, `SELECT COUNT(*) as cnt FROM WMS.HIT_SHIP_CONFIRM WHERE do = ?`, [cleanDo]);
        const otherCount = (otherCheckRows && otherCheckRows[0]) ? otherCheckRows[0].cnt : 0;
        result.otherEnvCheck = {
          env: otherEnv,
          connectionName: otherDbName,
          count: otherCount
        };
      } catch (errOther) {
        // ignore cross-check error
      }
    }

  } catch (err) {
    console.warn(`[OpenClaw] Live DB Fetch Warning for DO ${cleanDo} on ${connectionName}:`, err.message);
    result.queryError = err.message;
  }

  return result;
};

/**
 * Helper to build prompt for WMS Ship Confirm Step diagnosis
 */
const buildDiagnosticPrompt = ({ stepNum, stepName, doNumber, sql, data, message, table, db, detectedCause, env, liveDbData }) => {
  let liveDbSection = '';
  if (liveDbData) {
    liveDbSection = `
[ข้อมูลจริงสดจากฐานข้อมูล - Connection: ${liveDbData.connectionName}]:
- DO Number: ${liveDbData.do}
- ตาราง WMS.HIT_SHIP_CONFIRM: พบทั้งหมด ${liveDbData.hitShipConfirmCount} รายการ
  * PACK Rows: ${liveDbData.packSummary.count} รายการ (ยอดรวม: ${liveDbData.packSummary.totalQty} pcs)
  * Pallet No: ${liveDbData.packSummary.distinctPallets.join(', ') || '-'}
  * Date/Time บันทึก: ${liveDbData.packSummary.distinctDates.join(', ') || '-'}
- ตาราง WMS.SHIPMENTPLAN_DATA (แผนจัดส่ง):
\`\`\`json
${JSON.stringify(liveDbData.planData, null, 2)}
\`\`\`
- ตาราง WMS.HIT_TRANSFER_DATA_LOG_FTP (ประวัติการส่ง):
\`\`\`json
${JSON.stringify(liveDbData.logFtp, null, 2)}
\`\`\`
`;
  }

  return `
กรุณาวินิจฉัยข้อผิดพลาดของขั้นตอนระบบ WMS Ship Confirm ต่อไปนี้:

[ข้อมูลขั้นตอน]
- หมายเลขขั้นตอน: Step ${stepNum || '-'} (${stepName || '-'})
- หมายเลข DO (Delivery Order): ${doNumber || '-'}
- สภาพแวดล้อม/Connection: ${liveDbData ? liveDbData.connectionName : env}
- ตารางและฐานข้อมูลเป้าหมาย: ${table || '-'} (${db || '-'})
- ข้อความสถานะ/Error ที่ระบบตรวจพบ: ${message || '-'}
- ข้อสันนิษฐานเบื้องต้น: ${detectedCause || '-'}

[คำสั่ง SQL ที่รัน]
\`\`\`sql
${sql || '(ไม่มีคำสั่ง SQL)'}
\`\`\`

[ผลลัพธ์ข้อมูลที่ได้ (Data Rows / Count)]
\`\`\`json
${typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data || 'ไม่มีข้อมูล')}
\`\`\`
${liveDbSection}
[คำสั่งที่ต้องการจาก AI]:
1. ระบุชื่อฐานข้อมูลและ Connection (${liveDbData ? liveDbData.connectionName : env}) ที่ใช้ตรวจสอบ
2. วิเคราะห์สาเหตุที่ทำให้เกิดปัญหานี้อย่างละเอียดและตรงประเด็น โดยอ้างอิงจากข้อมูลจริงในฐานข้อมูลด้านบน (ตอบเป็นภาษาไทย)
3. ให้แนวทางแก้ไข พร้อมคำสั่ง SQL ที่ต้องใช้ตรวจสอบหรือแก้ไขข้อมูล (ถ้ามี) ให้ระบุอย่างชัดเจนและปลอดภัย
`;
};

/**
 * Helper to build rich System Prompt for interactive Chat with Live DB Grounding & Connection Awareness
 */
const buildChatSystemPrompt = (context = {}) => {
  const {
    doNumber,
    selectedDODetails,
    selectedDate,
    isDiagnosed,
    stepNum,
    stepName,
    stepStatus,
    sql,
    data,
    message,
    table,
    db,
    detectedCause,
    env,
    allStepsSummary,
    audit,
    liveDbData
  } = context;

  const currentConnectionName = liveDbData ? liveDbData.connectionName : (env === 'development' ? 'Development (BITINTRADEV)' : 'Production (BITINTRA_REAL)');

  let liveDbPromptSection = '';
  if (liveDbData && !liveDbData.queryError) {
    let crossCheckInfo = '';
    if (liveDbData.otherEnvCheck && liveDbData.otherEnvCheck.count > 0) {
      crossCheckInfo = `\n⚠️ ข้อสังเกตพิเศษ: ไม่พบข้อมูลใน ${liveDbData.connectionName} แต่ระบบตรวจพบข้อมูล DO นี้ใน ${liveDbData.otherEnvCheck.connectionName} จำนวน ${liveDbData.otherEnvCheck.count} รายการ (ผู้ใช้กำลังเลือกโหมด ${liveDbData.connectionName} อยู่)`;
    }

    liveDbPromptSection = `
[GROUND TRUTH: ข้อมูลจริงสดจากฐานข้อมูล Database (Connection: ${liveDbData.connectionName})]:
- DO Number: ${liveDbData.do}
- Target Database Connection: ${liveDbData.connectionName}
- ตาราง WMS.HIT_SHIP_CONFIRM:
  * จำนวนรายการทั้งหมดที่พบใน ${liveDbData.connectionName}: ${liveDbData.hitShipConfirmCount} แถว
  * รายการสถานะ PACK (ยิงยืนยันแพ็คแล้ว): ${liveDbData.packSummary.count} แถว (ยอด QTY รวม: ${liveDbData.packSummary.totalQty.toLocaleString()} ชิ้น)
  * วันที่/เวลาที่บันทึกใน HIT_SHIP_CONFIRM (date): ${liveDbData.packSummary.distinctDates.join(', ') || 'ไม่มี'}
  * หมายเลข Pallet (pallet_no): ${liveDbData.packSummary.distinctPallets.join(', ') || 'ไม่มี'}
  * รายการ SHIP BOX: ${liveDbData.shipBoxSummary.count} แถว (ยอด QTY รวม: ${liveDbData.shipBoxSummary.totalQty.toLocaleString()} ชิ้น)
  * ตัวอย่างข้อมูล 5 แถวแรกใน HIT_SHIP_CONFIRM:
\`\`\`json
${JSON.stringify(liveDbData.packRows.slice(0, 5), null, 2)}
\`\`\`

- ตาราง WMS.SHIPMENTPLAN_DATA / SHIPMENTDO_DATA (ข้อมูลแผนจัดส่ง):
\`\`\`json
${JSON.stringify(liveDbData.planData, null, 2)}
\`\`\`

- ตาราง WMS.HIT_TRANSFER_DATA_LOG_FTP (ประวัติการส่งไฟล์ SFTP):
${liveDbData.logFtp.length > 0 
  ? '```json\n' + JSON.stringify(liveDbData.logFtp, null, 2) + '\n```' 
  : '(ไม่พบประวัติใน LOG_FTP แปลว่ายังไม่เคยส่ง หรือยังไม่เคยถูกบันทึกส่งสำเร็จ)'}

- ตาราง WMS.HIT_SHIP_TO_MASTER (Prefix Master):
\`\`\`json
${JSON.stringify(liveDbData.prefixMaster, null, 2)}
\`\`\`
${crossCheckInfo}
`;
  }

  return `You are Belton AI, an expert enterprise AI diagnostic and troubleshooting assistant for Belton Technology's WMS Ship Confirm pipeline (FTP to Western Digital / Hitachi customer integration).
You query and verify data directly from the active database connection.

[Current Context from WMS Ship Confirm Dashboard]:
- Active Database Connection: ${currentConnectionName}
- Selected DO: ${doNumber || 'ยังไม่ได้เลือก DO'}
- Selected Filter Date on Dashboard: ${selectedDate || 'ไม่ได้ระบุ'}
- DO Metadata in List: ${selectedDODetails ? JSON.stringify(selectedDODetails) : 'ไม่ได้ระบุ'}
- Flow Diagnostics Executed?: ${isDiagnosed ? 'ใช่ (รันวิเคราะห์ครบทุก Step แล้ว)' : 'ยังไม่ได้กดรันวิเคราะห์ภาพรวม (Pending Execution)'}
- Active Step Selected: Step ${stepNum || '-'} (${stepName || '-'}) [Status: ${stepStatus || 'idle'}]
- Target Table & Database: ${table || '-'} (${db || '-'})
- Step Status/Message: ${message || 'ปกติ'}
- Step Detected Cause: ${detectedCause || 'None'}
- Active Step Query:
\`\`\`sql
${sql || '(ไม่มีคำสั่ง SQL)'}
\`\`\`
- Active Step Data loaded in frontend:
\`\`\`json
${typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data || 'ไม่มีข้อมูล')}
\`\`\`
- All 10 Steps Pipeline Overview:
${allStepsSummary || 'ไม่ได้ระบุ'}
- Audit Summary (QTY Plan vs Pack):
${audit ? JSON.stringify(audit, null, 2) : 'ไม่ได้ระบุ'}
${liveDbPromptSection}
[CRITICAL INSTRUCTIONS FOR AI]:
1. **ระบุ Connection เสมอ:**
   - ในการตอบคำถาม ให้ระบุอย่างชัดเจนว่ากำลังตรวจสอบข้อมูลจากฐานข้อมูล Connection ใด เช่น \`📊 ฐานข้อมูลที่ตรวจสอบ: ${currentConnectionName}\`
2. **ใช้ข้อมูลจริงจากส่วน [GROUND TRUTH: ข้อมูลจริงสดจากฐานข้อมูล Database] ตอบคำถาม:**
   - เมื่อผู้ใช้ถามเรื่อง **วันที่ส่งสินค้า (Ship Date / Date)**, ยอดรวม QTY, หมายเลขพาเลท, สถานะ PACK, หรือประวัติการส่ง ให้ดูจากตารางจริงที่ดึงสดมาด้านบนและตอบผู้ใช้โดยตรงเป็นข้อมูลจริงทันที
   - หากในตาราง \`HIT_SHIP_CONFIRM\` มีข้อมูล \`date\` (เช่น \`2026-08-20 08:12:04\`) หรือตาราง \`SHIPMENTPLAN_DATA\` มี \`ship_date\` ให้บอกวันที่และเวลาดังกล่าวแก่ผู้ใช้ทันที
   - หากผู้ใช้เลือก Development แต่ข้อมูลอยู่ใน Production (หรือกลับกัน) ให้แจ้งเตือนผู้ใช้ว่าพบข้อมูลในอีก Connection หนึ่ง และแนะนำให้สลับ DB Mode
3. ตอบเป็นภาษาไทยอย่างสุภาพ กระชับ ชัดเจน และตรงประเด็น
4. เมื่อให้คำสั่ง SQL สำหรับตรวจสอบหรือแก้ไขข้อมูล ให้ใส่ใน Markdown code block (\`\`\`sql ... \`\`\`) เสมอ`;
};

/**
 * Helper to normalize and format Cookie header & Authorization header
 * Handles raw base64 tokens, '_openclaw_auth=...', and full multi-cookie strings
 */
const formatCookieAndAuth = (input) => {
  let str = String(input || '').trim();
  let tokenVal = '';
  let agentVal = 'developer';

  if (str.includes('_openclaw_auth=')) {
    const match = str.match(/_openclaw_auth=([^;\s]+)/);
    if (match) tokenVal = match[1].trim();
  } else {
    const semiIdx = str.indexOf(';');
    if (semiIdx !== -1) {
      const parts = str.split(';').map(p => p.trim());
      for (const p of parts) {
        if (p.startsWith('_openclaw_auth=')) {
          tokenVal = p.substring('_openclaw_auth='.length).trim();
          break;
        }
      }
      if (!tokenVal && parts.length > 0) {
        tokenVal = parts[0];
      }
    } else {
      tokenVal = str.replace(/^_openclaw_auth=/, '').trim();
    }
  }

  if (str.includes('_agent=')) {
    const match = str.match(/_agent=([^;\s]+)/);
    if (match) agentVal = match[1].trim();
  }

  const cookieHeader = `_openclaw_auth=${tokenVal}; _agent=${agentVal}`;
  const authHeader = `Bearer ${tokenVal}`;

  return { cookieHeader, authHeader, tokenVal };
};

/**
 * Helper to build the target completions URL
 */
const buildEndpointUrl = (urlInput) => {
  if (!urlInput) {
    return `${DEFAULT_OPENCLAW_URL}/api/v1/chat/completions`;
  }
  const cleanUrl = urlInput.trim().replace(/\/+$/, '');
  if (cleanUrl.endsWith('/chat/completions')) {
    return cleanUrl;
  }
  return `${cleanUrl}/api/v1/chat/completions`;
};

/**
 * Extract DO Number from text if available
 */
const extractDoFromText = (text) => {
  if (!text) return null;
  const match = text.match(/\b([A-Z]{3,4}\d{6,8})\b/i);
  return match ? match[1].toUpperCase() : null;
};

/**
 * POST /api/openclaw/chat
 * Interactive Multi-turn Chat with Open Claw AI + Live DB Grounding & Connection Awareness
 */
router.post('/openclaw/chat', async (req, res) => {
  try {
    const {
      messages = [],
      context = {},
      cookie,
      endpointUrl,
      model = 'openclaw'
    } = req.body;

    const authCookie = cookie || getOpenClawToken() || '';
    if (!authCookie) {
      return res.status(400).json({
        status: 400,
        error: 'ไม่พบ Token/Cookie สำหรับ Open Claw (กรุณากดปุ่ม ⚙️ เพื่อตั้งค่า Cookie _openclaw_auth)'
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        status: 400,
        error: 'ไม่มีข้อความสำหรับการสนทนา (messages array is required)'
      });
    }

    // Determine target DO: from context or extracted from last user message
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const targetDo = context.doNumber || extractDoFromText(lastUserMessage) || (context.selectedDODetails ? context.selectedDODetails.do : null);
    const env = context.env || 'production';

    // 🚀 Query Live Database for Ground-Truth DO Context using the ACTIVE connection
    let liveDbData = null;
    if (targetDo) {
      liveDbData = await fetchLiveDoContext(targetDo, env);
    }

    const { cookieHeader, authHeader } = formatCookieAndAuth(authCookie);
    const systemPrompt = buildChatSystemPrompt({
      ...context,
      doNumber: targetDo,
      env,
      liveDbData
    });

    // Build the messages payload with system context prompt prepended + Multimodal Image Support
    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => {
        const role = m.role === 'user' ? 'user' : (m.role === 'assistant' ? 'assistant' : 'user');
        
        // Handle multimodal image attachments
        if (Array.isArray(m.images) && m.images.length > 0) {
          const textVal = String(m.content || '').trim() || 'กรุณาวิเคราะห์รูปภาพนี้ตามบริบท WMS Ship Confirm';
          const rawBase64List = [];
          const contentParts = [
            { type: 'text', text: textVal },
            ...m.images.map(img => {
              const urlVal = typeof img === 'object' ? (img.dataUrl || img.url || '') : String(img);
              const cleanBase64 = urlVal.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
              rawBase64List.push(cleanBase64);
              return {
                type: 'image_url',
                image_url: { url: urlVal }
              };
            })
          ];
          return { 
            role, 
            content: contentParts,
            images: rawBase64List // Support Ollama / LiteLLM / custom vision gateways
          };
        } else if (Array.isArray(m.content)) {
          return { role, content: m.content };
        } else {
          return { role, content: String(m.content || '') };
        }
      })
    ];

    const targetUrl = buildEndpointUrl(endpointUrl);
    const startTime = Date.now();

    const payload = {
      model: model || 'openclaw',
      messages: fullMessages
    };

    const resp = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Authorization': authHeader
      },
      timeout: 60000,
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });

    const durationMs = Date.now() - startTime;
    const resData = resp.data;

    // Check if redirected to login page in HTML
    if (typeof resData === 'string' && (resData.includes('<!DOCTYPE html>') || resData.includes('<html'))) {
      return res.status(401).json({
        status: 401,
        error: 'Open Claw Session หมดอายุ (ระบบ Redirect ไปหน้า Login)',
        hint: 'กรุณาระบุ Cookie _openclaw_auth ใหม่ผ่านปุ่มตั้งค่า ⚙️'
      });
    }

    let aiResponseText = '';
    if (resData.choices && resData.choices.length > 0) {
      aiResponseText = resData.choices[0].message?.content || resData.choices[0].text || '';
    } else if (resData.response) {
      aiResponseText = resData.response;
    } else if (resData.content) {
      aiResponseText = resData.content;
    } else if (resData.answer) {
      aiResponseText = resData.answer;
    } else if (resData.message) {
      aiResponseText = typeof resData.message === 'string' ? resData.message : JSON.stringify(resData.message);
    } else {
      aiResponseText = typeof resData === 'string' ? resData : JSON.stringify(resData, null, 2);
    }

    return res.json({
      status: 200,
      success: true,
      data: {
        reply: aiResponseText,
        durationMs: durationMs,
        timestamp: new Date().toISOString(),
        model: model || 'openclaw',
        connectionUsed: liveDbData ? liveDbData.connectionName : env,
        liveDbFetched: !!liveDbData
      }
    });

  } catch (err) {
    console.error('OpenClaw Chat Error:', err.message);
    const statusCode = err.response?.status || 500;
    const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.response?.data?.error || err.message;

    return res.status(statusCode).json({
      status: statusCode,
      error: `เชื่อมต่อ Open Claw ล้มเหลว (${statusCode}): ${errorMsg}`,
      details: err.response?.data || null,
      hint: statusCode === 401 ? 'Cookie _openclaw_auth อาจหมดอายุ กรุณากดปุ่ม ⚙️ เพื่อวาง Cookie ใหม่' : undefined
    });
  }
});

/**
 * POST /api/openclaw/diagnose
 * Sends diagnostic request to Open Claw AI + Live DB Grounding
 */
router.post('/openclaw/diagnose', async (req, res) => {
  try {
    const {
      stepNum,
      stepName,
      doNumber,
      sql,
      data,
      message,
      table,
      db,
      detectedCause,
      env,
      cookie,
      endpointUrl,
      customPrompt
    } = req.body;

    const authCookie = cookie || getOpenClawToken() || '';
    if (!authCookie) {
      return res.status(400).json({
        status: 400,
        error: 'ไม่พบ Token/Cookie สำหรับ Open Claw (กรุณาระบุผ่านปุ่ม ⚙️ ตั้งค่า Cookie ในหน้าเว็บ)'
      });
    }

    // Fetch Live DB data for DO if available
    let liveDbData = null;
    if (doNumber) {
      liveDbData = await fetchLiveDoContext(doNumber, env);
    }

    const { cookieHeader, authHeader } = formatCookieAndAuth(authCookie);

    const promptText = customPrompt || buildDiagnosticPrompt({
      stepNum,
      stepName,
      doNumber,
      sql,
      data,
      message,
      table,
      db,
      detectedCause,
      env,
      liveDbData
    });

    const targetUrl = buildEndpointUrl(endpointUrl);
    console.log(`[OpenClaw] Requesting endpoint: ${targetUrl} (model: openclaw)`);

    const startTime = Date.now();

    const payload = {
      model: 'openclaw',
      messages: [
        {
          role: 'system',
          content: 'You are an enterprise AI diagnostic assistant for Belton Technology WMS Ship Confirm pipelines. Analyze SQL queries, missing rows, and data mismatches based on live database query results. Provide clear, direct Thai diagnosis and actionable SQL fix scripts.'
        },
        {
          role: 'user',
          content: promptText
        }
      ]
    };

    const resp = await axios.post(targetUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
        'Authorization': authHeader
      },
      timeout: 45000,
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 400
    });

    const durationMs = Date.now() - startTime;
    const resData = resp.data;

    // Check if redirected to login page in HTML
    if (typeof resData === 'string' && (resData.includes('<!DOCTYPE html>') || resData.includes('<html'))) {
      return res.status(401).json({
        status: 401,
        error: 'Open Claw Session หมดอายุ (ระบบ Redirect ไปหน้า Login)',
        hint: 'กรุณาระบุ Cookie _openclaw_auth ใหม่ผ่านปุ่มตั้งค่า Open Claw'
      });
    }

    let aiResponseText = '';
    if (resData.choices && resData.choices.length > 0) {
      aiResponseText = resData.choices[0].message?.content || resData.choices[0].text || '';
    } else if (resData.response) {
      aiResponseText = resData.response;
    } else if (resData.content) {
      aiResponseText = resData.content;
    } else if (resData.answer) {
      aiResponseText = resData.answer;
    } else if (resData.message) {
      aiResponseText = typeof resData.message === 'string' ? resData.message : JSON.stringify(resData.message);
    } else {
      aiResponseText = typeof resData === 'string' ? resData : JSON.stringify(resData, null, 2);
    }

    return res.json({
      status: 200,
      success: true,
      data: {
        aiDiagnosis: aiResponseText,
        durationMs: durationMs,
        timestamp: new Date().toISOString(),
        model: 'openclaw',
        stepNum: stepNum,
        connectionUsed: liveDbData ? liveDbData.connectionName : env,
        liveDbFetched: !!liveDbData
      }
    });

  } catch (err) {
    console.error('OpenClaw Diagnose Error:', err.message);
    const statusCode = err.response?.status || 500;
    const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.response?.data?.error || err.message;

    return res.status(statusCode).json({
      status: statusCode,
      error: `เชื่อมต่อ Open Claw ล้มเหลว (${statusCode}): ${errorMsg}`,
      details: err.response?.data || null,
      hint: statusCode === 401 ? 'Cookie _openclaw_auth อาจหมดอายุ กรุณาตรวจสอบหรือคัดลอก Cookie ใหม่จากเบราว์เซอร์' : undefined
    });
  }
});

/**
 * POST /api/openclaw/test-connection
 * Tests simple connectivity to Open Claw
 */
router.post('/openclaw/test-connection', async (req, res) => {
  try {
    const { cookie, endpointUrl } = req.body;
    const authCookie = cookie || getOpenClawToken() || '';

    if (!authCookie) {
      return res.status(400).json({
        status: 400,
        error: 'ไม่พบ Cookie/Token สำหรับ Open Claw'
      });
    }

    const { cookieHeader, authHeader } = formatCookieAndAuth(authCookie);
    const testUrl = buildEndpointUrl(endpointUrl);
    const startTime = Date.now();

    const resp = await axios.post(
      testUrl,
      {
        model: 'openclaw',
        messages: [{ role: 'user', content: 'Ping test. ตอบ "OK" สั้นๆ' }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
          'Authorization': authHeader
        },
        timeout: 15000,
        maxRedirects: 0,
        validateStatus: status => status >= 200 && status < 400
      }
    );

    const duration = Date.now() - startTime;
    const resData = resp.data;

    if (typeof resData === 'string' && (resData.includes('<!DOCTYPE html>') || resData.includes('<html'))) {
      return res.status(401).json({
        status: 401,
        error: 'เชื่อมต่อได้ แต่ถูก Redirect ไปหน้า Login (Session/Cookie ไม่ถูกต้องหรือหมดอายุ)'
      });
    }

    return res.json({
      status: 200,
      success: true,
      durationMs: duration,
      message: `เชื่อมต่อ Open Claw สำเร็จ! (${duration}ms)`,
      raw: typeof resData === 'object' ? resData : { response: resData }
    });

  } catch (err) {
    console.error('OpenClaw Test Connection Error:', err.message);
    const statusCode = err.response?.status || 500;
    const errorMsg = err.response?.data?.error?.message || err.response?.data?.message || err.response?.data?.error || err.message;

    return res.status(statusCode).json({
      status: statusCode,
      error: `เชื่อมต่อไม่สำเร็จ (${statusCode}): ${errorMsg}`,
      details: err.response?.data || null
    });
  }
});

module.exports = router;
