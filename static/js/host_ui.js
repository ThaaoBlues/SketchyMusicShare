let wakeLock = null;

window.onload = (ev)=>{
  keepAwake();
  start_networking();

  generateQrCodes();
};

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


function generateQrCodes(room_id){
  let base_url = "https://api.qrserver.com/v1/create-qr-code/?size=150x150&data="
  let server_url = window.location.protocol+"//"+window.location.hostname+":"+window.location.port
  let host_url = base_url+server_url+"/host/"+window.ROOM_ID
  let guest_url = base_url+server_url+"/guest/"+window.ROOM_ID
  
  document.getElementById("host_qr").setAttribute("src",host_url)
  document.getElementById("guest_qr").setAttribute("src",guest_url)

}