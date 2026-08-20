const express = require('express')
const router = express.Router()
const { checkLoginSession } = require('./middleware.js');

router.get('/', (req, res) => {
  if (req.session.username) {
    res.redirect('/main_menu');
  } else {
    res.render('pages/authentication/frm_login')
  }
  // res.redirect('/main_menu');
})

router.get('/main_menu', checkLoginSession, (req, res) => {
  res.render('pages/main_menu')
})

router.get('/debug-aca', checkLoginSession, (req, res) => {
  res.render('pages/aca/debug_aca')
})

router.get('/debug-fca', checkLoginSession, (req, res) => {
  res.render('pages/fca/debug_fca')
})

router.get('/debug-fca-advanced', checkLoginSession, (req, res) => {
  res.render('pages/fca/debug_fca_advanced')
})

router.get('/fca-flow', checkLoginSession, (req, res) => {
  res.render('pages/fca/fca_flow_interactive')
})


// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(); // ทำลาย Session
  res.redirect('/');
});

// Favicon
router.get('/favicon.ico', (req, res) => {
  const path = require('path');
  res.sendFile(path.join(__dirname, '../public/img/smwh_icon_sm.png'));
});

module.exports = router