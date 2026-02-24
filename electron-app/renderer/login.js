// electron-app/renderer/login.js
// Login screen logic

document.addEventListener('DOMContentLoaded', async () => {
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const rememberMeCheckbox = document.getElementById('rememberMe');
  const loginButton = document.getElementById('loginButton');
  const testConnectionButton = document.getElementById('testConnectionButton');
  const noVpnButton = document.getElementById('noVpnButton');
  const errorMessage = document.getElementById('errorMessage');
  const togglePasswordButton = document.getElementById('togglePassword');

  // Load Oracle connection defaults
  try {
    const defaults = await window.electronAPI.getOracleDefaults();
    document.getElementById('oracleHost').textContent = defaults.hostPort;
    document.getElementById('oracleDatabase').textContent = defaults.serviceName;
  } catch (error) {
    console.error('Error loading Oracle defaults:', error);
    document.getElementById('oracleHost').textContent = 'Error loading';
    document.getElementById('oracleDatabase').textContent = 'Error loading';
  }

  // Toggle password visibility
  togglePasswordButton.addEventListener('click', () => {
    const type = passwordInput.type === 'password' ? 'text' : 'password';
    passwordInput.type = type;

    // Update icon
    const icon = togglePasswordButton.querySelector('svg');
    if (type === 'text') {
      icon.innerHTML = `
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
        <line x1="1" y1="1" x2="23" y2="23"></line>
      `;
    } else {
      icon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
        <circle cx="12" cy="12" r="3"></circle>
      `;
    }
  });

  // Show error message
  function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(() => {
      errorMessage.style.display = 'none';
    }, 5000);
  }

  // Set loading state
  function setLoading(isLoading) {
    loginButton.disabled = isLoading;
    testConnectionButton.disabled = isLoading;
    usernameInput.disabled = isLoading;
    passwordInput.disabled = isLoading;
    rememberMeCheckbox.disabled = isLoading;

    const buttonText = loginButton.querySelector('.button-text');
    const buttonSpinner = loginButton.querySelector('.button-spinner');

    if (isLoading) {
      buttonText.textContent = 'Signing In...';
      buttonSpinner.style.display = 'inline-block';
    } else {
      buttonText.textContent = 'Sign In';
      buttonSpinner.style.display = 'none';
    }
  }

  // Test connection button
  testConnectionButton.addEventListener('click', async () => {
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showError('Please enter both username and password');
      return;
    }

    setLoading(true);
    errorMessage.style.display = 'none';

    try {
      const result = await window.electronAPI.login({
        username,
        password,
        rememberMe: false // Don't save on test
      });

      if (result.success) {
        showError('✅ Connection successful!');
        errorMessage.classList.add('success-message');
        setTimeout(() => {
          errorMessage.classList.remove('success-message');
        }, 3000);
      } else {
        showError(result.error || 'Connection failed');
      }
    } catch (error) {
      showError(error.message || 'Connection test failed');
    } finally {
      setLoading(false);
      // Don't proceed to main app on test - user needs to click Sign In
    }
  });

  // No VPN button - continue without Oracle access
  noVpnButton.addEventListener('click', async () => {
    noVpnButton.disabled = true;
    noVpnButton.textContent = 'Starting...';
    errorMessage.style.display = 'none';

    try {
      const result = await window.electronAPI.loginNoVpn();

      if (result.success) {
        console.log('No-VPN login successful - baseline mode');
      } else {
        showError(result.error || 'Failed to start in no-VPN mode');
        noVpnButton.disabled = false;
        noVpnButton.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          Continue without VPN
        `;
      }
    } catch (error) {
      console.error('No-VPN login error:', error);
      showError(error.message || 'Failed to start in no-VPN mode');
      noVpnButton.disabled = false;
      noVpnButton.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
        </svg>
        Continue without VPN
      `;
    }
  });

  // Handle login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const rememberMe = rememberMeCheckbox.checked;

    if (!username || !password) {
      showError('Please enter both username and password');
      return;
    }

    setLoading(true);
    errorMessage.style.display = 'none';

    try {
      const result = await window.electronAPI.login({
        username,
        password,
        rememberMe
      });

      if (result.success) {
        // Success! Main process will load the main app
        console.log('Login successful');
      } else {
        showError(result.error || 'Login failed. Please check your credentials.');
        setLoading(false);
      }
    } catch (error) {
      console.error('Login error:', error);
      showError(error.message || 'An unexpected error occurred');
      setLoading(false);
    }
  });

  // Focus username input on load
  usernameInput.focus();

  // Handle Enter key in password field
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loginForm.dispatchEvent(new Event('submit'));
    }
  });
});
