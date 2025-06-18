function prompt_and_join_room(server_ip,server_port,host){
    let room_id = prompt("Enter room code");
    let url = "http://"+server_ip+":"+server_port
    if(host){
        url += "/host/"
    }else{
        url += "/guest/"
    }
    
    url += room_id

    window.location.href = url
}