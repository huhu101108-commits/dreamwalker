// The studio supplies a snapshot and its images. This file is also used by the offline HTML.
const project = GAME_DATA.project;
const note = (message) => {
  document.querySelector('#gameNote').textContent = message;
};
function start() {
  document.querySelector('#replay').hidden = true;
  launchGame(GAME_DATA.mapId || project.startMap, GAME_DATA.screenId);
}
document.querySelector('#game').addEventListener('close', () => {
  if (parent !== window) parent.postMessage({ dreamwalker: 'close' }, '*');
  else document.querySelector('#replay').hidden = false;
});
document.querySelector('#replay').onclick = start;
start();
