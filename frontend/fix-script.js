import fs from 'fs';
import path from 'path';

const target = 'd:/Hybrid sentry2/frontend/src';
const lists = [
    'components/EventLogPage.jsx',
    'components/VerifyQueuePage.jsx',
    'components/FieldCommsPage.jsx',
    'components/GPSMapPage.jsx',
    'components/AnalyticsPage.jsx',
    'components/HeatmapPage.jsx',
    'components/GalleryPage.jsx',
    'components/ReportsPage.jsx',
    'components/SentryPortalPage.jsx',
    'components/SystemStatusPage.jsx',
    'pages/MonitorDashboard.jsx',
    'pages/RecorderDashboard.jsx'
];
let changed = false;
lists.forEach(fp => {
  const file = path.join(target, fp);
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  let newCode = code;
  
  newCode = newCode.replace(/fetch\('\/api\//g, "fetch('http://localhost:8000/api/");
  newCode = newCode.replace(/new WebSocket\('\/ws\//g, "new WebSocket('ws://localhost:8000/ws/");
  newCode = newCode.replace(/fetch\(\`\/api\//g, "fetch(`http://localhost:8000/api/");
  
  newCode = newCode.replace(/fetch\(\`\$\{API\}\/api\//g, "fetch(`http://localhost:8000/api/");
  newCode = newCode.replace(/fetch\(\`\$\{API_BASE\}\/api\//g, "fetch(`http://localhost:8000/api/");
  newCode = newCode.replace(/new WebSocket\(\`\$\{WS\}\/ws\//g, "new WebSocket(`ws://localhost:8000/ws/");

  if (code !== newCode) {
    fs.writeFileSync(file, newCode);
    console.log('Updated ' + fp);
    changed = true;
  }
});
if (!changed) console.log('No matches found to replace.');
