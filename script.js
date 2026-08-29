(function () {
  const viewport = document.getElementById('mainViewport');
  const panel = document.getElementById('centerPanelToggle');
  const prompt = document.getElementById('clickPrompt');
  const container = document.getElementById('contentContainer');
  let step = 0;

  viewport.addEventListener('click', function (e) {
    if (step === 0) {
      prompt.style.display = 'none';
      panel.classList.add('is-visible');
      step = 1;
      e.stopPropagation();
    }
  });

  panel.addEventListener('click', function (e) {
    if (step === 1) {
      panel.style.animation = 'none';
      void panel.offsetWidth;
      requestAnimationFrame(function () {
        panel.classList.add('is-hidden');
        container.classList.add('main-content-active');
      });
      step = 2;
      e.stopPropagation();
    } else if (step === 2) {
      panel.classList.toggle('is-hidden');
      e.stopPropagation();
    }
  });
})();