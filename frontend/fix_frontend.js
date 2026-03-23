const fs = require('fs');
const path = require('path');

const projectDir = 'd:/Hybrid sentry2/frontend/src';

function walk(dir, callback) {
    fs.readdirSync(dir).forEach(file => {
        const filepath = path.join(dir, file);
        if (fs.statSync(filepath).isDirectory()) {
            walk(filepath, callback);
        } else if (filepath.endsWith('.jsx')) {
            callback(filepath);
        }
    });
}

const loginPath = path.join(projectDir, 'pages', 'Login.jsx');
let loginContent = fs.readFileSync(loginPath, 'utf8');

// Fix 1: Health check useEffect
loginContent = loginContent.replace(
/  \/\* Fetch org name \+ system info \*\/\r?\n  useEffect\(\(\) => \{[\s\S]*?\}, \[\]\)/,
`  useEffect(() => {
    fetch('http://localhost:8000/api/system/setup-required')
      .then(r => { if(r.ok) setServerOk(true) })
      .catch(() => setServerOk(false))
  }, [])`
);

// Ensuring setServerOk is defined
if (!loginContent.includes('setServerOk')) {
    loginContent = loginContent.replace(
        `const [serverError, setServerError] = useState(false)`,
        `const [serverError, setServerError] = useState(false)\n  const [serverOk, setServerOk] = useState(false)`
    );
}

// Fix 2: handleSubmit replacement
const handleSubmitRegex = /(?:async function handleSubmit\(\) \{|const handleSubmit = async \(\) => \{)[\s\S]*?(?=function triggerShake\(\))/;
const newHandleSubmit = `const handleSubmit = async () => {
    const pinStr = Array.isArray(pin) ? pin.join('') : pin;
    if (!username.trim() || !pinStr.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), pin: pinStr.trim() })
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('user', JSON.stringify(data))
        localStorage.setItem('token', data.access_token)
        if (data.role === 'recorder') window.location.href = '/recorder'
        else window.location.href = '/monitor'
      } else {
        setError(typeof data.detail === 'string' ? data.detail : 'Login failed')
      }
    } catch {
      setError('Cannot reach server. Start backend first.')
    } finally {
      setLoading(false)
    }
  }

  `;
loginContent = loginContent.replace(handleSubmitRegex, newHandleSubmit);

// Fix 3: Error display in JSX
const errorJsxRegex = /\{error && !lockout && !serverError && <div style=\{s\.error\}>\{error\}<\/div>\}/;
const newErrorJsx = `{error && (
          <div style={{color:'#f85149',fontSize:12,marginTop:8,textAlign:'center'}}>
            {typeof error === 'string' ? error : 'Login failed'}
          </div>
        )}`;
loginContent = loginContent.replace(errorJsxRegex, newErrorJsx);

fs.writeFileSync(loginPath, loginContent);


// MonitorDashboard.jsx logout function
const monitorPath = path.join(projectDir, 'pages', 'MonitorDashboard.jsx');
let monitorContent = fs.readFileSync(monitorPath, 'utf8');
const logoutRegex = /async function logout\(\) \{[\s\S]*?navigate\('\/login'\)\r?\n  \}/;
const newLogout = `const logout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    window.location.href = '/login'
  }`;
monitorContent = monitorContent.replace(logoutRegex, newLogout);
fs.writeFileSync(monitorPath, monitorContent);


// ALL COMPONENTS FETCH & WS REPLACEMENTS
walk(projectDir, (filepath) => {
    let content = fs.readFileSync(filepath, 'utf8');
    let changed = false;

    // fetch('/api/ -> fetch('http://localhost:8000/api/
    if (content.includes("fetch('/api/")) {
        content = content.replace(/fetch\('\/api\//g, "fetch('http://localhost:8000/api/");
        changed = true;
    }
    // new WebSocket('/ws/ -> new WebSocket('ws://localhost:8000/ws/
    if (content.includes("new WebSocket('/ws/")) {
        content = content.replace(/new WebSocket\('\/ws\//g, "new WebSocket('ws://localhost:8000/ws/");
        changed = true;
    }
    // fetch(\`/api/ -> fetch(\`http://localhost:8000/api/
    if (content.includes("fetch(`/api/")) {
        content = content.replace(/fetch\(\`\/api\//g, "fetch(`http://localhost:8000/api/");
        changed = true;
    }

    // new WebSocket(\`/ws/ -> new WebSocket(\`ws://localhost:8000/ws/ (just in case)
    if (content.includes("new WebSocket(`/ws/")) {
        content = content.replace(/new WebSocket\(\`\/ws\//g, "new WebSocket(`ws://localhost:8000/ws/");
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filepath, content);
        console.log("Updated URLs in", filepath);
    }
});

console.log("Done");
