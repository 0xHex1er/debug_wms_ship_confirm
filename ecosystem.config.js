module.exports = {
  apps: [
    {
      name: "debug_wms_ship_confirm_9999",
      script: "./app.js",
      watch: true, // เหมือน nodemon จะปิด-เปิดแอปใหม่เวลามีการเซฟไฟล์
      ignore_watch: ["node_modules", "public", ".git", "views"], // โฟลเดอร์ที่ไม่ต้องการให้ watch
      env_development: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      },
      env_local: {
        NODE_ENV: "local",
      },
    },
  ],
};