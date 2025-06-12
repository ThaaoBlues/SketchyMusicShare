let wakeLock = null;

window.onload((ev)=>{
  keepAwake();
});

async function keepAwake() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => {
      console.log('Wake Lock was released');
    });
  } catch (err) {
    console.error(`${err.name}, ${err.message}`);
  }
}
