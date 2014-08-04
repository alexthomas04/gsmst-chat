var state ={};
var socket = io();

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
		console.log(message);
	});
});
var height=10;
socket.on('chat',function(message){
	height+=100;
	$('#chatArea').append('<p><strong>'+message.user+':</strong> '+message.chat+'<p>').scrollTop(height);
});

socket.on('alert',function(message){
	var text='';
	if(message.alert=='entered')
		text = message.user +' entered room';
	else if(message.alert=='left')
		text = message.user+' left room';
	$('#chatArea').append($('<footer></footer>').text(text));
});