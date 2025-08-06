function prompt_and_join_room(host){
    let room_id = prompt("Enter room code");


    let url = window.location.href

    if(host){
        url += "/host/"
    }else{
        url += "/guest/"
    }
    
    url += room_id

    window.location.href = url
}