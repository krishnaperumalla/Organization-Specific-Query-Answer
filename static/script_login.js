 let isLogin = true;
        const form = document.getElementById('authForm');
        const formTitle = document.getElementById('formTitle');
        const submitBtn = document.getElementById('submitBtn');
        const toggleLink = document.getElementById('toggleLink');
        const errorMsg = document.getElementById('errorMsg');
        const successMsg = document.getElementById('successMsg');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const loadingOverlay = document.getElementById('loadingOverlay');

        toggleLink.addEventListener('click', (e) => {
            e.preventDefault();
            isLogin = !isLogin;
            
            if (isLogin) {
                formTitle.textContent = 'Welcome Back';
                submitBtn.textContent = 'Sign In';
                document.querySelector('.toggle-form').innerHTML = 'Don\'t have an account? <a id="toggleLink">Create Account</a>';
            } else {
                formTitle.textContent = 'Create Account';
                submitBtn.textContent = 'Sign Up';
                document.querySelector('.toggle-form').innerHTML = 'Already have an account? <a id="toggleLink">Sign In</a>';
            }
            
            document.getElementById('toggleLink').addEventListener('click', arguments.callee);
            errorMsg.style.display = 'none';
            successMsg.style.display = 'none';
            form.reset();
        });

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            if (!email || !password) {
                showError('Please fill in all fields');
                return;
            }
            
            errorMsg.style.display = 'none';
            successMsg.style.display = 'none';
            submitBtn.disabled = true;
            submitBtn.textContent = isLogin ? 'Signing In...' : 'Signing Up...';
            
            try {
                const endpoint = isLogin ? '/login' : '/register';
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    localStorage.setItem('user_email', email);
                    showSuccess(data.message || (isLogin ? 'Login successful!' : 'Registration successful!'));
                    
                    loadingOverlay.style.display = 'flex';
                    
                    setTimeout(() => {
                        window.location.href = '/';
                    }, 2000);
                } else {
                    showError(data.error || 'An error occurred. Please try again.');
                }
            } catch (error) {
                console.error('Auth error:', error);
                showError('Network error. Please check your connection and try again.');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = isLogin ? 'Sign In' : 'Sign Up';
            }
        });

        function showError(message) {
            errorMsg.textContent = message;
            errorMsg.style.display = 'block';
        }

        function showSuccess(message) {
            successMsg.textContent = message;
            successMsg.style.display = 'block';
        }

        window.addEventListener('DOMContentLoaded', () => {
            const userEmail = localStorage.getItem('user_email');
            if (userEmail) {
                window.location.href = '/';
            }
        });