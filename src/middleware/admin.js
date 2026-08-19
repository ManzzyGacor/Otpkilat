module.exports = (req, res, next) => {
  if (req.session.role !== 'admin') {
    if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
      return res.status(403).json({ success: false, error: { message: 'Akses ditolak. Fitur ini hanya untuk Admin.' } });
    }
    return res.status(403).send('Akses Ditolak: Anda tidak memiliki izin untuk melihat halaman ini.');
  }
  next();
};