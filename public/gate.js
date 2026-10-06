(() => {
  const form = document.getElementById('access-form');
  const password = document.getElementById('password');
  const reveal = form.querySelector('.reveal');
  const submit = form.querySelector('.enter');
  const label = submit.querySelector('span');
  const message = document.getElementById('form-message');
  // Only fixed destinations are allowed; the tote flow never shows a page chooser.
  const destination = new URLSearchParams(location.search).get('site') === 'tote'
    ? 'https://totebag.builtbyaether.com/' : 'https://bees.builtbyaether.com/';

  function enterPage() {
    password.value = '';
    location.replace(destination);
  }

  async function hasSession() {
    const response = await fetch('/__session', {
      credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(15000)
    });
    return response.ok && (await response.json()).ok === true;
  }
  // A previous login also works here, without revealing the other experience.
  hasSession().then(active => { if (active) enterPage(); }).catch(() => {});

  reveal.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show));
    reveal.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  });
  password.addEventListener('input', () => {
    password.removeAttribute('aria-invalid');
    message.textContent = '';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    label.textContent = 'Opening…';
    message.textContent = '';
    try {
      const response = await fetch('/__auth', {
        method: 'POST',
        headers: { 'X-Bees-Password': password.value },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: AbortSignal.timeout(15000)
      });
      if (response.status === 401) {
        message.textContent = 'Incorrect password. Try again.';
        password.setAttribute('aria-invalid', 'true');
        password.focus();
        password.select();
      } else if (response.ok && (await response.json()).ok === true) {
        if (await hasSession()) {
          enterPage();
          return;
        }
        message.textContent = 'Enable cookies in your browser, then try again.';
      } else {
        throw new Error('Could not sign in');
      }
    } catch {
      message.textContent = 'We couldn’t connect. Please try again in a moment.';
    }
    submit.disabled = false;
    label.textContent = 'Continue';
  });
})();
