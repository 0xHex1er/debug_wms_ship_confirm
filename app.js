const dotenv = require('dotenv');
const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
const bodyParser = require('body-parser');
const { DB } = require('./config/db.js');

const envFile = process.env.NODE_ENV === 'production'
  ? '.env.production'
  : process.env.NODE_ENV === 'local'
    ? '.env.local'
    : '.env.development';
dotenv.config({ path: envFile });
console.log(` - Environment : ${process.env.NODE_ENV}`);

const port = process.env.PORT;

const app = express();
app.use(cors());
app.set('view engine', 'ejs');
app.options('*', cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true })); // สำหรับ form data

let mySqlConnection;
if (process.env.NODE_ENV === 'local') {
  app.listen(port, async () => {
    console.log(` - Server is running at http://localhost:${port}`)
    try {
      mySqlConnection = await DB.getConnection();
      // console.log(` - MySQL Server Thread ID : ${mySqlConnection.threadId} || ${mySqlConnection.config.host}`);
      console.log(` - DB Env : ${mySqlConnection.config.host.includes('dev') ? 'Development' : 'Production'}`);
    } catch (err) {
      console.error(`Error connecting to MySQL : ${err}`);
    } finally {
      if (mySqlConnection) mySqlConnection.release();
    }
  });
}


app.use('/public', express.static('public'));
app.use(cookieParser());
app.use(session({
  secret: 'debug_ship_confirm_9999#0940', // คีย์สำหรับเข้ารหัส
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // ใช้สำหรับ HTTP [true, false]
    maxAge: 14400000 // อายุ Session 4 ชั่วโมง
  }
}));
app.use((req, res, next) => {
  // ส่งค่า Session ให้ template ทุกหน้า
  res.locals.username = req.session.username || null;
  res.locals.isLogin = req.session.isLogin || false;
  next();
});

fs.readdirSync('./routes').forEach((file) => {
  app.use('/', require('./routes/' + 'controller.js'));

  // Function to load API controllers recursively
  const loadAPIControllers = (dir) => {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    items.forEach((item) => {
      const fullPath = `${dir}/${item.name}`;
      if (item.isDirectory()) {
        // Recursively load from subdirectories
        loadAPIControllers(fullPath);
      } else if (item.isFile() && item.name.endsWith('.js')) {
        // Load JS files as API controllers
        app.use('/api', require('./' + fullPath));
      }
    });
  };

  // Load all API controllers
  loadAPIControllers('./routes/api');
});


// Create HTTPS server
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development') {
  const sslOptions = {
    ca: fs.readFileSync("/etc/httpd/conf/ssl.crt/beltontechnology_com.ca-bundle"),
    key: fs.readFileSync("/etc/httpd/conf/ssl.crt/beltontechnology_com.key"),
    cert: fs.readFileSync("/etc/httpd/conf/ssl.crt/beltontechnology_com.crt"),
  };

  const server = https.createServer(sslOptions, app);
  // Start the HTTPS server
  server.listen(port, async () => {
    console.log(` - Server is running at https://localhost:${port}`);
    try {
      mySqlConnection = await DB.getConnection();
      console.log(` - MySQL Server Thread ID : ${mySqlConnection.threadId} || ${mySqlConnection.config.host}`);
      console.log(` - DB Env : ${mySqlConnection.config.host.includes('dev') ? 'Development' : 'Production'}`);
    } catch (err) {
      console.error(`Error connecting to MySQL : ${err}`);
    } finally {
      if (mySqlConnection) mySqlConnection.release();
    }
  });
}