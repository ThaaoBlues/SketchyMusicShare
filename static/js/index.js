function prompt_and_joint_room(host,server_ip){
    let room_id = prompt("Enter room code");
    let url = "http://"+server_ip+":7171"
    if(host){
        url += "/host/"
    }else{
        url += "/guest/"
    }
    
    url += room_id

    window.location.href = url
}