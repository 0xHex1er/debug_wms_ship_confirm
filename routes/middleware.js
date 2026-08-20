function checkLoginSession(req, res, next) {
    // Auto-login for local development / testing
    if (!req.session.username && process.env.NODE_ENV === 'local') {
      req.session.username = 'admin_debug';
      req.session.isLogin = true;
    }

    // ตรวจสอบว่ามี Session ผู้ใช้หรือไม่
    if (req.session.username) {
      // มี Session ให้ผ่านไปยังหน้าถัดไป
      next();
    } else {
      // ไม่มี Session ให้ redirect ไปหน้า login
      res.redirect('/');
    }
}

module.exports = {
    checkLoginSession  
}