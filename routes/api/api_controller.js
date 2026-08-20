const dotenv = require('dotenv');
const express = require('express');
const XLSX = require('xlsx');
const path = require('path');
const api = express.Router();
const { exeQuery, insertQuery, exeQuerySQLServer, insertQuerySQLServer } = require('../../config/db.js');
const axios = require('axios');
const app = require('../../app.js');
const { getEnvFile } = require('../../config/env.js');
const { checkLoginSession } = require('../middleware.js');

const envFile = getEnvFile();
dotenv.config({ path: envFile });

// ================ [START API AUTHENTICATION] =================
api.post('/check-login', async (req, res) => {
  try {
    let response = {
      status: 200,
      message: '',
    }
    const { username, password } = req.body;
    let result = await axios.post(process.env.LOGIN_API_URL, { username, password });
    if (Object.keys(result.data.data).length == 0) {
      response.status = 500;
      response.message = result.data.message;
    } else {
      let en = result.data.data.EN;
      if (result.data.data.USERNAME) { // ตรวจสอบ Session
        try {
          req.session.username = result.data.data.USERNAME;
          req.session.isLogin = true;
        }
        catch (err) {
          req.session.username = '';
          req.session.isLogin = false;
          response.status = 500;
          response.message = "Not found user";
          return res.status(500).json({ error: 'Error API : เกิดข้อผิดพลาด API' });
        }
      }
    }
    return res.send(response);
  } catch (err) {
    return res.status(500).json({ error: 'Error API : เกิดข้อผิดพลาด API' });
  }
});

api.post('/logout', async (req, res) => {
  try {
    req.session.destroy(); // ทำลาย Session
    return res.send({ message: "Logout success" });
  } catch (err) {
    console.error(`Error API 3rd : ${err}`);
  }
});
// ================= [END API AUTHENTICATION] ==================

module.exports = api