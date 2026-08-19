module.exports = (req, res, next) => {
  if (!req.session.userId) {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(401).json({ success: false, error: { message: 'Silakan login terlebih dahulu.' } });
    }
    return res.redirect('/login');
  }
  next();
};