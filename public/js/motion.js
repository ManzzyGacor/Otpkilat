
document.addEventListener('DOMContentLoaded', () => {
  // Native IntersectionObserver untuk Scroll Reveal yang ringan
  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, observerInstance) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('active');
        observerInstance.unobserve(entry.target); // Hanya dijalankan sekali
      }
    });
  }, observerOptions);

  document.querySelectorAll('.motion-slide-up').forEach(el => {
    observer.observe(el);
  });

  // Global Animated Number Transition untuk Perubahan Saldo
  window.animateValue = function(elementId, start, end, duration = 500) {
    const obj = document.getElementById(elementId);
    if (!obj) return;
    
    let startTimestamp = null;
    const step = (timestamp) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const currentVal = Math.floor(progress * (end - start) + start);
      obj.innerText = 'Rp' + currentVal.toLocaleString('id-ID');
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  };
});
