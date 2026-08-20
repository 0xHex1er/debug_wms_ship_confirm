const mysql = require('mysql2/promise');

// =====================================================
// Environment & Configuration Setup
// =====================================================
const ENV = process.env.NODE_ENV || 'production';

const ENV_CONFIG = {
    production: {
        wms: 'BITINTRA',
        hitachi: 'SGFCDB02',
        hgstaca: 'WDHUDB01'
    },
    development: {
        wms: 'BITINTRADEV',
        hitachi: 'BITINTRADEV',
        hgstaca: 'BITINTRADEV'
    },
    local: {
        wms: 'BITINTRADEV',
        hitachi: 'BITINTRADEV',
        hgstaca: 'BITINTRADEV'
    }
};

console.log(` ->>>>>>>>>>>>>>>> Environment: ${ENV} | DateTime: ${new Date().toLocaleString()}`);

const getConnectionDetails = require('../../../_common5/db.Config.js');
const currentConfig = ENV_CONFIG[ENV] || ENV_CONFIG.production;

// Load configs for current environment
const configWMS = getConnectionDetails(currentConfig.wms);
const configHitachi = getConnectionDetails(currentConfig.hitachi);
const configHgstaca = getConnectionDetails(currentConfig.hgstaca);

// Load configs for production (for data cloning)
const configWMSProd = getConnectionDetails(ENV_CONFIG.production.wms);
const configHitachiProd = getConnectionDetails(ENV_CONFIG.production.hitachi);
const configHgstacaProd = getConnectionDetails(ENV_CONFIG.production.hgstaca);

// Load configs for development (for data cloning)
const configWMSDev = getConnectionDetails(ENV_CONFIG.development.wms);
const configHitachiDev = getConnectionDetails(ENV_CONFIG.development.hitachi);
const configHgstacaDev = getConnectionDetails(ENV_CONFIG.development.hgstaca);

// =====================================================
// Current Environment Connection Pools
// =====================================================

// Main WMS Pool
const DB = mysql.createPool({
    connectionLimit: 100,
    host: configWMS.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configWMS.HOST,
    user: configWMS.USERNAME,
    password: configWMS.PASSWORD,
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

console.log(' - MySQL WMS Pool Created: ' + configWMS.USERNAME + '@' + configWMS.HOST + ' [' + currentConfig.wms + ']');

// HITACHI Production Database Pool
const DB_HITACHI = mysql.createPool({
    connectionLimit: 50,
    host: configHitachi.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configHitachi.HOST,
    user: configHitachi.USERNAME,
    password: configHitachi.PASSWORD,
    database: 'HITACHI',
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

console.log(' - MySQL HITACHI Pool Created: ' + configHitachi.USERNAME + '@' + configHitachi.HOST + '/HITACHI' + ' [' + currentConfig.hitachi + ']');

// HGSTACA Production Database Pool
const DB_HGSTACA = mysql.createPool({
    connectionLimit: 50,
    host: configHgstaca.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configHgstaca.HOST,
    user: configHgstaca.USERNAME,
    password: configHgstaca.PASSWORD,
    database: 'HGSTACA',
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

console.log(' - MySQL HGSTACA Pool Created: ' + configHgstaca.USERNAME + '@' + configHgstaca.HOST + '/HGSTACA' + ' [' + currentConfig.hgstaca + ']');

// =====================================================
// Production Connection Pools (for data cloning source)
// =====================================================

const DB_PROD_WMS = mysql.createPool({
    connectionLimit: 20,
    host: configWMSProd.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configWMSProd.HOST,
    user: configWMSProd.USERNAME,
    password: configWMSProd.PASSWORD,
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

const DB_PROD_HITACHI = mysql.createPool({
    connectionLimit: 20,
    host: configHitachiProd.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configHitachiProd.HOST,
    user: configHitachiProd.USERNAME,
    password: configHitachiProd.PASSWORD,
    database: 'HITACHI',
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

const DB_PROD_HGSTACA = mysql.createPool({
    connectionLimit: 20,
    host: configHgstacaProd.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configHgstacaProd.HOST,
    user: configHgstacaProd.USERNAME,
    password: configHgstacaProd.PASSWORD,
    database: 'HGSTACA',
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

console.log(' - Production Pools (Clone Source) Initialized');

// =====================================================
// Development Connection Pools (for data cloning destination)
// =====================================================

const DB_DEV_WMS = mysql.createPool({
    connectionLimit: 20,
    host: configWMSDev.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configWMSDev.HOST,
    user: configWMSDev.USERNAME,
    password: configWMSDev.PASSWORD,
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

const DB_DEV_HITACHI = mysql.createPool({
    connectionLimit: 20,
    host: configHitachiDev.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configHitachiDev.HOST,
    user: configHitachiDev.USERNAME,
    password: configHitachiDev.PASSWORD,
    database: 'HITACHI',
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

const DB_DEV_HGSTACA = mysql.createPool({
    connectionLimit: 20,
    host: configHgstacaDev.HOST === 'devth-db2' ? 'devth-db2.th.belton.corp' : configHgstacaDev.HOST,
    user: configHgstacaDev.USERNAME,
    password: configHgstacaDev.PASSWORD,
    database: 'HGSTACA',
    waitForConnections: true,
    charset: 'utf8',
    dateStrings: true,
    multipleStatements: false
});

console.log(' - Development Pools (Clone Destination) Initialized');

// =====================================================
// Response Helper
// =====================================================
const createResponse = function (status, data, message, error_message) {
    return {
        status: status || 200,
        data: data || null,
        message: message || '',
        error_message: error_message || ''
    };
};

// =====================================================
// Buffer Sanitizer Helper (Converts Buffers to Strings)
// =====================================================
const sanitizeBuffer = function (val) {
    if (val === null || val === undefined) return val;
    if (Buffer.isBuffer(val)) return val.toString('utf8');
    if (Array.isArray(val)) return val.map(sanitizeBuffer);
    if (typeof val === 'object' && !(val instanceof Date)) {
        if (val.type === 'Buffer' && Array.isArray(val.data)) {
            return Buffer.from(val.data).toString('utf8');
        }
        const newObj = {};
        for (const key of Object.keys(val)) {
            newObj[key] = sanitizeBuffer(val[key]);
        }
        return newObj;
    }
    return val;
};

// =====================================================
// MySQL Query Functions
// =====================================================
const exeQueryMySQL = async function (sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    let connection;
    try {
        connection = await DB.getConnection();
        const result = await connection.query(sql, params);
        const rows = sanitizeBuffer(result[0]);
        return httpResponse ? createResponse(200, rows, 'success', '') : rows;
    } catch (err) {
        console.error('[MySQL Query Error]', { sql: sql, error: err.message, code: err.code });
        return httpResponse ? createResponse(500, null, '', err.code || err.message) : null;
    } finally {
        if (connection) connection.release();
    }
};

const insertQuery = async function (sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    let connection;
    try {
        connection = await DB.getConnection();
        const result = await connection.execute(sql, params);
        const insertResult = result[0];
        return httpResponse ? createResponse(200, insertResult, 'success', '') : insertResult;
    } catch (err) {
        console.error('[MySQL Insert Error]', { sql: sql, error: err.message, code: err.code });
        return httpResponse ? createResponse(500, null, '', err.code || err.message) : null;
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// HITACHI Database Query Functions
// =====================================================
const exeQueryHitachi = async function (sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    let connection;
    try {
        connection = await DB_HITACHI.getConnection();
        const result = await connection.query(sql, params);
        const rows = sanitizeBuffer(result[0]);
        return httpResponse ? createResponse(200, rows, 'success', '') : rows;
    } catch (err) {
        console.error('[HITACHI Query Error]', { sql: sql, error: err.message, code: err.code });
        return httpResponse ? createResponse(500, null, '', err.code || err.message) : null;
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// HGSTACA Database Query Functions
// =====================================================
const exeQueryHgstaca = async function (sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    let connection;
    try {
        connection = await DB_HGSTACA.getConnection();
        const result = await connection.query(sql, params);
        const rows = sanitizeBuffer(result[0]);
        return httpResponse ? createResponse(200, rows, 'success', '') : rows;
    } catch (err) {
        console.error('[HGSTACA Query Error]', { sql: sql, error: err.message, code: err.code });
        return httpResponse ? createResponse(500, null, '', err.code || err.message) : null;
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// SQL Server Query Functions
// =====================================================
const exeQuerySQLServer = async function (sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    console.error('[SQL Server Not Configured] SQL Server support has been removed from this project.');
    return httpResponse ? createResponse(500, null, '', 'SQL Server not configured') : null;
};

const insertQuerySQLServer = async function (sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    console.error('[SQL Server Not Configured] SQL Server support has been removed from this project.');
    return httpResponse ? createResponse(500, null, '', 'SQL Server not configured') : null;
};

const exeQueryEnv = async function (poolType, env, sql, params, httpResponse) {
    params = params || [];
    httpResponse = httpResponse || false;
    let pool;
    const isProd = (env === 'production' || env === 'prod');
    if (poolType === 'hitachi') {
        pool = isProd ? DB_PROD_HITACHI : DB_DEV_HITACHI;
    } else if (poolType === 'hgstaca') {
        pool = isProd ? DB_PROD_HGSTACA : DB_DEV_HGSTACA;
    } else {
        pool = isProd ? DB_PROD_WMS : DB_DEV_WMS;
    }
    let connection;
    try {
        connection = await pool.getConnection();
        const result = await connection.query(sql, params);
        const rows = sanitizeBuffer(result[0]);
        return httpResponse ? createResponse(200, rows, 'success', '') : rows;
    } catch (err) {
        console.error('[MySQL Env Query Error]', { poolType, env, sql, error: err.message });
        return httpResponse ? createResponse(500, null, '', err.code || err.message) : null;
    } finally {
        if (connection) connection.release();
    }
};

// =====================================================
// Module Exports
// =====================================================
module.exports = {
    // Current environment pools
    DB: DB,
    DB_HITACHI: DB_HITACHI,
    DB_HGSTACA: DB_HGSTACA,

    // Production pools (clone source)
    DB_PROD_WMS: DB_PROD_WMS,
    DB_PROD_HITACHI: DB_PROD_HITACHI,
    DB_PROD_HGSTACA: DB_PROD_HGSTACA,

    // Development pools (clone destination)
    DB_DEV_WMS: DB_DEV_WMS,
    DB_DEV_HITACHI: DB_DEV_HITACHI,
    DB_DEV_HGSTACA: DB_DEV_HGSTACA,

    // Query functions
    exeQuery: exeQueryMySQL,           // Backward compatibility (WMS)
    exeQueryMySQL: exeQueryMySQL,
    exeQueryHitachi: exeQueryHitachi,
    exeQueryHgstaca: exeQueryHgstaca,
    exeQueryEnv: exeQueryEnv,
    insertQuery: insertQuery,
    exeQuerySQLServer: exeQuerySQLServer,    // Stub for backward compatibility
    insertQuerySQLServer: insertQuerySQLServer,  // Stub for backward compatibility
    getConnectionDetails: getConnectionDetails
};
