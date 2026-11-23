function note(text){document.getElementById('device-note').textContent=text;}
renderDeviceWorkspace(document.getElementById('device-local'),false);
window.addEventListener('pagehide',releaseDevicePreview);
