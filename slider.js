(() => {
  'use strict';
  const stage = document.getElementById('comparison');
  const slider = document.getElementById('slider');
  const before = document.getElementById('before');
  const after = document.getElementById('after');
  const status = document.getElementById('status');
  const name = new URLSearchParams(location.search).get('project') || 'sales';
  const projects = window.SLIDER_PROJECTS;
  const project = projects && Object.hasOwn(projects, name) ? projects[name] : null;

  function fail(message) {
    stage.hidden = true;
    status.className = 'error';
    status.textContent = message;
  }

  if (!project) {
    fail('Проект не найден. Проверьте параметр project в адресе.');
    return;
  }

  function load(img, src, alt) {
    return new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Не удалось загрузить изображения. Проверьте файлы и пути в projects.js.'));
      img.alt = alt;
      img.src = src;
    });
  }

  function render() {
    const value = Number(slider.value);
    stage.style.setProperty('--position', `${value}%`);
    slider.setAttribute('aria-valuetext', `До: ${value}%, после: ${100 - value}%`);
  }

  let pointer = null;
  function move(event) {
    const rect = stage.getBoundingClientRect();
    slider.value = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
    render();
  }
  slider.addEventListener('input', render);
  slider.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || pointer !== null) return;
    event.preventDefault();
    slider.focus({ preventScroll: true });
    pointer = event.pointerId;
    slider.setPointerCapture(pointer);
    move(event);
  });
  slider.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) move(event);
  });
  function release(event) {
    if (event.pointerId !== pointer) return;
    pointer = null;
    if (slider.hasPointerCapture(event.pointerId)) slider.releasePointerCapture(event.pointerId);
  }
  slider.addEventListener('pointerup', release);
  slider.addEventListener('pointercancel', release);
  slider.addEventListener('lostpointercapture', () => { pointer = null; });

  Promise.all([
    load(before, project.before, project.beforeAlt),
    load(after, project.after, project.afterAlt)
  ]).then(() => {
    const ratio = before.naturalWidth / before.naturalHeight;
    const afterRatio = after.naturalWidth / after.naturalHeight;
    // Different proportions cannot align exactly without cropping or stretching.
    if (Math.abs(ratio / afterRatio - 1) > 0.001) {
      throw new Error('Пропорции изображений различаются. Подготовьте два изображения с одинаковым соотношением сторон.');
    }
    stage.style.setProperty('--ratio', ratio);
    document.title = project.title;
    slider.setAttribute('aria-label', `${project.title}: сравнение до и после`);
    render();
    stage.hidden = false;
    status.textContent = '';
  }).catch(error => fail(error.message));
})();
