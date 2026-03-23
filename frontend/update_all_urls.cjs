const fs = require('fs');
const path = require('path');

function replaceInFile(filePath, replacements) {
    if (!fs.existsSync(filePath)) return false;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;
    for (const [target, replacement] of replacements) {
        content = content.split(target).join(replacement);
    }
    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Updated ${path.basename(filePath)}`);
        return true;
    }
    return false;
}

const componentDir = path.join(__dirname, 'src', 'components');
const pageDir = path.join(__dirname, 'src', 'pages');

const filesToProcess = [];
if (fs.existsSync(componentDir)) {
    filesToProcess.push(...fs.readdirSync(componentDir).filter(f => f.endsWith('.jsx')).map(f => path.join(componentDir, f)));
}
if (fs.existsSync(pageDir)) {
    filesToProcess.push(...fs.readdirSync(pageDir).filter(f => f.endsWith('.jsx')).map(f => path.join(pageDir, f)));
}

const baseReplacements = [
    ["fetch('/api/", "fetch('http://localhost:8000/api/"],
    ["new WebSocket('/ws/", "new WebSocket('ws://localhost:8000/ws/"],
    ["fetch(`/api/", "fetch(`http://localhost:8000/api/"]
];

for (const file of filesToProcess) {
    replaceInFile(file, baseReplacements);
}

// Fix MonitorDashboard.jsx
const monitorDashboardPath = path.join(pageDir, 'MonitorDashboard.jsx');
if (fs.existsSync(monitorDashboardPath)) {
    let content = fs.readFileSync(monitorDashboardPath, 'utf8');
    
    // Replace old logout function with the required one
    const oldLogoutRegex = /async function logout\(\) \{[\s\S]*?navigate\('\/login'\)\s*\}/;
    const newLogout = `const logout = () => {
    localStorage.removeItem('user')
    localStorage.removeItem('token')
    window.location.href = '/login'
  }`;
    if (oldLogoutRegex.test(content)) {
        content = content.replace(oldLogoutRegex, newLogout);
        fs.writeFileSync(monitorDashboardPath, content, 'utf8');
        console.log('Fixed MonitorDashboard.jsx logout');
    }
}

// Fix Login.jsx exactly
const loginPath = path.join(pageDir, 'Login.jsx');
if (fs.existsSync(loginPath)) {
    let content = fs.readFileSync(loginPath, 'utf8');
    
    // FIX 1
    const oldHealthRegex = /fetch\('http:\/\/localhost:8000\/api\/system\/setup-required'\)\s*\.then\(r => \{\s*if\s*\(r\.ok\)\s*setServerOk\(true\)\s*else\s*setServerOk\(false\)\s*\}\)\s*\.catch\(\(\) => setServerOk\(false\)\)/;
    const newHealth = `fetch('http://localhost:8000/api/system/setup-required')
      .then(r => { if(r.ok) setServerOk(true) })
      .catch(() => setServerOk(false))`;
    content = content.replace(oldHealthRegex, newHealth);

    // FIX 2
    const oldSubmitRegex = /const handleLogin = async \(\) => \{[\s\S]*?finally \{\s*setLoading\(false\)\s*\}\s*\}/;
    const newSubmit = `const handleLogin = async () => {
    if (!username.trim() || !pin.trim()) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('http://localhost:8000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), pin: pin.trim() })
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
  }`;
    content = content.replace(oldSubmitRegex, newSubmit);

    // FIX 3
    const oldErrorRegex = /\{error && !lockout && !serverError && \([\s\S]*?\{\w* \? \w* : \w*\?\.detail \|\| 'Login failed'\}[\s\S]*?\}\)/;
    const newError = `{error && !lockout && !serverError && (
          <div style={{color:'#f85149',fontSize:12,marginTop:8,textAlign:'center'}}>
            {typeof error === 'string' ? error : 'Login failed'}
          </div>
        )}`;
    content = content.replace(oldErrorRegex, newError);

    // Clean up old pin stringification workaround if there
    content = content.replace(/pin: \(Array\.isArray\(pin\) \? pin\.join\(''\) : String\(pin\)\)\.trim\(\)/g, "pin: pin.trim()");
    
    // Also change `pin.trim()` if pin is an Array! Oh wait, `!pin.trim()` will crash if `pin` is an array.
    // The user's code relies on `pin` being a string. In Login.jsx, if `pin` is an array, `pin.trim` is undefined.
    // So let me also convert pin state from `const [pin, setPin] = useState([])` to `const [pin, setPin] = useState('')`
    content = content.replace(/const \[pin, setPin\]\s*=\s*useState\(\[\]\)/, "const [pin, setPin] = useState('')");
    // Array.from({length: MAX_PIN}) filled check: `const filled = i < pin.length` is fine for strings.
    // However, `[...prev, e.key]` fails for strings. We should change `[...prev, e.key]` to `prev + e.key`.
    content = content.replace(/setPin\(prev => prev.length < MAX_PIN \? \[\.\.\.prev, e\.key\] : prev\)/g, "setPin(prev => prev.length < MAX_PIN ? prev + e.key : prev)");
    content = content.replace(/setPin\(prev => prev.slice\(0, -1\)\)/g, "setPin(prev => prev.slice(0, -1))");
    // Also remove Array.isArray from handleLogin if left
    
    fs.writeFileSync(loginPath, content, 'utf8');
    console.log('Fixed Login.jsx');
}
