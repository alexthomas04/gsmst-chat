var state ={};
var socket = io();
var interval;
var typing = {};
socket.on('me',function(message){
	state = message;
	$('#title').text('Welcome '+state.username);
	console.log(message);
});

socket.on('rooms',function(message){
	$(document).ready(function(){
		var scope = angular.element('#rooms').scope();
		scope.rooms = message.rooms;
		scope.$apply();
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
		
		console.log(message);
	});
});
var height=10;
socket.on('chat',function(message){
	height+=100;
	$('#chatArea').append('<p><strong>'+message.user+':</strong> '+message.chat+'<p>').scrollTop(height);
	if(document.body.className=='blurred'){
		clearInterval(interval);
		interval = setInterval(function(){
			if(document.title=="New Message"){
				document.title='You have'
			}else{
				document.title='New Message';
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
	}
	$('#chatArea').append($('<footer></footer>').text(text));
});

socket.on('startTyping',function(message){
	console.log(message);
	if(typing.whois==undefined)
		typing.whois = [];
	typing.whois.push(message.username);
	updateAngularTyping();
});
socket.on('stopTyping',function(message){
	typing.whois.splice(typing.whois.indexOf(message.username),1);
	updateAngularTyping();
});

function onBlur() {
	document.body.className = 'blurred';
};
function onFocus(){
	document.body.className = 'focused';
	clearInterval(interval);
	document.title='GSMST CHAT';
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
	 console.log(typing.whois);
	var scope = angular.element('#typing').scope();
	scope.typing= typing.text;
	scope.$apply();
}