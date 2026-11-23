// The studio supplies a snapshot and its images. This file is also used by the offline HTML.
const project = GAME_DATA.project;
const note = (message) => {
  document.querySelector('#gameNote').textContent = message;
};
function start() {
  document.querySelector('#replay').hidden = true;
  launchGame(GAME_DATA.mapId || project.startMap, GAME_DATA.screenId, GAME_DATA.inspection||false);
}
document.querySelector('#game').addEventListener('close', e => {
  if(parent!==window){const modal=e.currentTarget;setTimeout(()=>parent.postMessage({dreamwalker:'close',...modal.inspectionSample},'*'),0);}
  else document.querySelector('#replay').hidden = false;
});
window.addEventListener('message',e=>{if(e.source===parent&&e.data?.dreamwalker==='request-exit')document.querySelector('#game[open]')?.close();});
document.querySelector('#replay').onclick = start;
start();
