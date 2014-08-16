var state ={};
var socket = io();
var interval;
var typing = {};
socket.on('me',function(message){
	state = message;
	$('#title').text('Welcome '+state.username);
});

socket.on('rooms',function(message){
	$(document).ready(function(){
		var scope = angular.element('#rooms').scope();
		scope.rooms=$.extend(true, scope.rooms, message.rooms);
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
	height+=100;
	var $p = $('<p></p>');
	var $strong = $('<strong></strong>');
	var $text =$('<span></span>');
	var $small = $('<small></small>');
	var $time = $('<small></small>');
	var $kick  = $('<a href="#"><span class="glyphicon glyphicon-ban-circle text-danger"></span></a>');
	$kick.on('click',function(event){
		socket.emit('kick',{"user_id":message.user_id});
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
	$p.append($strong);
	$p.append($text);
	$p.append($time)
	$('#chatArea').append($p).scrollTop(height);
	if(document.body.className=='blurred'){
		clearInterval(interval);
		interval = setInterval(function(){
			if(document.title=="New Assignment"){
				document.title='You have'
			}else if(document.title='You have'){
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
		text = '<span class="alert alert-danger">Invalid Room Password</span>';
	}else if(message.alert=='danger'){
		text = '<span class="alert alert-danger">'+message.text+'</span>';
	}
	else if(message.alert=='info'){
		text = '<span class="alert alert-info">'+message.text+'</span>';
	}
	$('#chatArea').append($('<footer></footer>').append(text));
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
	$img.attr('src',message.file);
	$img.addClass('drag_image');
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
	$p.append($img);
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









var settings = {};
if(!$.cookie('settings')){
	updateSettings({showRank:true,showTime:true});
}
else {
settings = $.parseJSON($.cookie('settings'));
}