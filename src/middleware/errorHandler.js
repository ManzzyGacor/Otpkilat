module.exports = (err, req, res, next) => {
  console.error('System Error:', err.stack);
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Terjadi kesalahan internal pada server.';

  if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
    return res.status(statusCode).json({
      success: false,
      error: {
        message: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan pada server.' : message
      }
    });
  }

  res.status(statusCode).render('500', { 
    error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan pada server.' : message 
  });
};