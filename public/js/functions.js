var state ={};
var socket = io();
var interval;
var typing = {};
var bannie_id=-5;
var rooms =[];

if (Notification && Notification.permission !== "granted")
    Notification.requestPermission();
socket.on('me',function(message){
	state = message;
	if($('#room').css('display')=='none')
		$('#title').text('Welcome '+state.username);
});

socket.on('rooms',function(message){
	$(document).ready(function(){
		var scope = angular.element('#rooms').scope();
		scope.rooms=$.extend(true, scope.rooms, message.rooms);
		rooms = message.rooms;
			scope.$apply();
			for (var i = scope.rooms.length - 1; i >= 0; i--) {
				if(message.roooms.indexof(scope.rooms[i])==-1)
					scope.rooms.splice(i,1);
			};

		// if in room update current room
		scope = angular.element('#room').scope();
		var id = (scope.room||{}).id;
		if(id!=undefined)
		{
			for (var i = message.rooms.length - 1; i >= 0; i--) {
				var room = message.rooms[i];
				if(room.id==id)
					scope.room=room;
			};
			scope.$apply();
					}
		
		
	});
});
var height=10;
socket.on('chat',function(message){
	height+=400;
	var $p = $('<p></p>');
    var $a = $('<a href="/u/'+message.user_id+'" target="_blank"></a>');
	var $strong = $('<strong></strong>');
	var $text =$('<span></span>');
	var $small = $('<small></small>');
	var $time = $('<small></small>');
	var $kick  = $('<a href="#" data-toggle="modal" data-target="#ban" ><span class="glyphicon glyphicon-ban-circle text-danger"></span></a>');
	$kick.click(function(event) {
		bannie_id=message.user_id;
	});
	if(message.rank != 'User')
		$small.append('['+message.rank+'] ');
	$strong.text(message.user+": ");
	$small.addClass('chat_rank');
	$text.append(message.chat);
	var dt = new Date(message.time);
	var hours = dt.getHours();
    var minutes = dt.getMinutes();
    var seconds = dt.getSeconds();
    if (hours < 10) 
     hours = '0' + hours;

    if (minutes < 10) 
     minutes = '0' + minutes;

    if (seconds < 10) 
     seconds = '0' + seconds;
	$time.text(hours+":"+minutes+":"+seconds);
	$time.addClass('chat_time');

	if(!settings.showTime)
		$time.hide();
	if(!settings.showRank)
		$small.hide();
	if(message.color!=undefined){
		var color = message.color;
		if(color.nameColor!=undefined){
			$strong.css('color', color.nameColor);
		}
		if(color.backgroundName!=undefined){
			$strong.css('background-color',color.backgroundName);
		}
		if(color.textColor!=undefined){
			$text.css('color', color.textColor);
		}
		if(color.textBackground!=undefined){
			$text.css('background-color',color.textBackground);
		}
	}
	if(message.kickable && state.permissions.create)
		$p.append($kick);
	$p.append($small);
	$a.append($strong);
    $p.append($a);
	$p.append($text);
	$p.append($time);
	$('#chatArea').append($p).scrollTop(height);
    if(message.correctAnswer){
        parseQuestion(message.correctAnswer,message.chat);
    }
	if(document.body.className=='blurred'){
		if(Notification && settings.showNotifications){
			var notification = new Notification(message.user, {
    		body: message.chat
 			});
			notification.onShow=setTimeout(function(){notification.close();},settings.notifcationDuration || 2000);
			notification.onClick=function(x) { window.focus(); this.cancel(); };
		}
		document.title='You have';
		clearInterval(interval);
		interval = setInterval(function(){
			if(document.title=="New Assignment"){
				document.title='You have';
			}else if(document.title=='You have'){
				document.title='New Assignment';
			}
		},1000);
	}
});

socket.on('alert',function(message){
	var text='';
	
	if(message.alert=='entered'){
		text = message.user +' entered room';
		if(message.entrance != undefined){
		$('#chatArea').append($('<strong></strong>').text(message.entrance));	
		text='';
		}
	}
	else if(message.alert=='left'){
		text = message.user+' left room';
	}else if(message.alert=='invalid password'){
		text = '<div class="alert alert-danger">Invalid Room Password</div>';
	}else if(message.alert=='danger'){
		text = '<div class="alert alert-danger">'+message.text+'</div>';
	}
	else if(message.alert=='info'){
		text = '<div class="alert alert-info">'+message.text+'</div>';
	}else if(message.alert == 'new message'){
		socket.emit('me',{});
		text = '<div class="alert alert-info">'+message.from+' says: '+message.message+'</div>';
	}
	$('#chatArea').append($('<div></div>').append(text));
	height+=400;
	$('#chatArea').scrollTop(height);
});

socket.on('startTyping',function(message){
	
	if(typing.whois==undefined)
		typing.whois = [];
	typing.whois.push(message.username);
	updateAngularTyping();
});
socket.on('stopTyping',function(message){
	typing.whois.splice(typing.whois.indexOf(message.username),1);
	updateAngularTyping();
});

socket.on('file',function(message){
	
	var $p = $('<p></p>');
	var $strong = $('<strong></strong>');
	var $img = $('<img></img>');
	var $link = $('<a></a>');
	$img.attr('src',message.file);
	$img.addClass('drag_image');
	$link.attr('href',message.file);
	$link.attr('target','blank');
	$link.append($img);
	$strong.text(message.user+" : ");
	if(message.color!=undefined){
		var color = message.color;
		if(color.nameColor!=undefined){
			$strong.css('color', color.nameColor);
		}
		if(color.backgroundName!=undefined){
			$strong.css('background-color',color.backgroundName);
		}
		if(color.textColor!=undefined){
			$text.css('color', color.textColor);
		}
		if(color.textBackground!=undefined){
			$text.css('background-color',color.textBackground);
		}
	}
	$p.append($strong);
	$p.append($link);
	height+=400;
	$('#chatArea').append($p).scrollTop(height);
});

function onBlur() {
	document.body.className = 'blurred';
};
function onFocus(){
	document.body.className = 'focused';
	clearInterval(interval);
	document.title='Homework';
};

if (/*@cc_on!@*/false) { // check for Internet Explorer
	document.onfocusin = onFocus;
	document.onfocusout = onBlur;
} else {
	window.onfocus = onFocus;
	window.onblur = onBlur;
}

var startTyping = function(){
	if(typing.isTyping!=true){
		typing.check = setInterval(function(){
			if(typing.last!=undefined && ((new Date())-typing.last)>700)
			{
				clearInterval(typing.check);
				typing.isTyping=false;
				socket.emit('stopTyping',{});
			}
		},100);
		typing.isTyping=true;
		socket.emit('startTyping',{});
	}
	typing.last=new Date();


}
var updateAngularTyping = function(){
	typing.text='';
	 for (var i = 0; i < typing.whois.length-1; i++) {
	 	var username=typing.whois[i];
	 	typing.text+=username+", ";
	 };
	 if(typing.whois.length>0)
	 	typing.text+=typing.whois[typing.whois.length-1]+(typing.whois.length>1?" are":" is")+" Typing";
	var scope = angular.element('#typing').scope();
	scope.typing= typing.text;
	scope.$apply();
}
var canEnterRoom=function(user,room){
	if(user.permissions!=undefined && user.permissions.god)
		return true;
	if(room.requirements){
		if(room.requirements.rank){

			if(user.permissions==undefined || !(user.permissions[room.requirements.rank]))
				return false;
		}
	}
	return true;

}



var updateSettings= function(data){
	if(data!=undefined){
		if($.cookie('settings')){
			data = $.extend(true, $.cookie('settings'), data);
		}
		$.cookie('settings',JSON.stringify(data),{path:'/',expires:1000});
		settings = data;
	}
	else{
		$.cookie('settings',JSON.stringify(settings),{path:'/',expires:1000});
	}
	if(!settings.showRank)
		$('.chat_rank').hide();
	else
		$('.chat_rank').show();
	if(!settings.showTime)
		$('.chat_time').hide();
	else
		$('.chat_time').show();
}

socket.on('connected',function(message){
	socket.emit('login', {
				hash: $.cookie('hash')
			});
	retroEnterRoom();
	
	
});
var retroEnterRoom = function(){
	if(rooms.length==0){
		setTimeout(retroEnterRoom,50);
		return;
	}
	var roomName = getParameterByName('room');
	if(roomName){
		var room = {};
		for(var i=0;i<rooms.length;i++){
			if(rooms[i].name ==roomName)
				room= rooms[i];
		}
		console.log(roomName);
		if (room && canEnterRoom(state, room)) {
						if (!(room.requirements != undefined && room.requirements.hasPassword)) {
							socket.emit('join-room', {
								roomId: room.id
							});	
							$('#loginSection,#registerButton,#addRoomButton').slideUp();

							$('#rooms').animate({
								left: "-100%"
							}, 500, function() {
								$('#title').text(room.name);
								$('#room,#clearChat').slideDown();
								angular.element('#room').scope().room = room;
								angular.element('#room').scope().$apply();
							});
							$('#leaveRoom').show();
						} 
					}
	}
	
};
var ban = function(duration){
	socket.emit('kick',{user_id:bannie_id,"duration":duration});
}







var settings = {};
if(!$.cookie('settings')){
	updateSettings({showRank:true,showTime:true,showNotifications:true});
}
else {
settings = $.parseJSON($.cookie('settings'));
}

function insertParam(key, value)
{
    key = encodeURI(key); value = encodeURI(value);

    var kvp = document.location.search.substr(1).split('&');

    var i=kvp.length; var x; while(i--) 
    {
        x = kvp[i].split('=');

        if (x[0]==key)
        {
            x[1] = value;
            kvp[i] = x.join('=');
            break;
        }
    }

    if(i<0) {kvp[kvp.length] = [key,value].join('=');}

    //this will reload the page, it's likely better to store this until finished
    document.location.search = kvp.join('&'); 
}
function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}