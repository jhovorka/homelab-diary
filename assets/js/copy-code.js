document.addEventListener('click', (event) => {
  const button = event.target.closest('.code-panel__copy');
  if (!button) return;

  const panel = button.closest('.code-panel');
  const raw = panel && panel.querySelector('.code-panel__raw');
  if (!raw) return;

  navigator.clipboard.writeText(raw.textContent).then(() => {
    if (button.dataset.resetTimer) {
      clearTimeout(Number(button.dataset.resetTimer));
    }
    button.classList.add('code-panel__copy--copied');
    button.querySelector('span').textContent = 'Copied';
    const timer = setTimeout(() => {
      button.classList.remove('code-panel__copy--copied');
      button.querySelector('span').textContent = 'Copy';
    }, 1500);
    button.dataset.resetTimer = String(timer);
  });
});
