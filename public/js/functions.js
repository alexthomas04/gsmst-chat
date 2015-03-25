var state ={};
var socket = io();
var interval;
var typing = {};
var bannie_id=-5;
var rooms =[];
var sent = [];
var lastSendId=-1;
var storage = $.localStorage;
var inRoom=false;

if ('Notification' in window && Notification.permission !== "granted")
    Notification.requestPermission();


socket.on('me',function(message){
	state = message;
	if($('#room').css('display')=='none')
		$('#title').text('Welcome '+state.username);
});

socket.on('rooms',function(message){
	$(document).ready(function(){
		var scope = angular.element('#rooms').scope();
        var hasRoom = function(room){
            for(var i=0;i<rooms.length;i++){
                if(rooms[i].id == room.id)
                    return true;
            }
            return false;

        };
		scope.rooms=$.extend(true, scope.rooms, message.rooms);
		rooms = message.rooms;
			for (var i = scope.rooms.length - 1; i >= 0; i--) {
				if(!hasRoom(scope.rooms[i]))
					scope.rooms.splice(i,1);
			}
			scope.$apply();

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
	message.chat = emoticons(message.chat);
	height+=400;
	var $p = $('<p></p>');
    var $a = $('<a href="/u/'+message.user_id+'" target="_blank"></a>');
	var $strong = $('<strong></strong>');
	var $text =$('<span></span>');
	var $small = $('<small></small>');
	var $time = $('<small></small>');
	var $kick  = $('<a href="#" data-toggle="modal" data-target="#ban" ><span class="glyphicon glyphicon-ban-circle text-danger"></span>&nbsp;</a>');
	var $admin = $('<a href="#" data-toggle="modal" data-target="#admin"><span class="glyphicon glyphicon-cog"></span>&nbsp;</a>');
	$kick.click(function(event) {
		bannie_id=message.user_id;
	});
	$admin.click(function(event){
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
	if(message.chat.toLowerCase().indexOf(state.username.toLowerCase())>-1){
		$p.css('background-color','red');
		$strong.css('color', '#ebebeb');
		$text.css('color','#ebebeb');
	}
	else{
		if(message.color!=undefined){
			var color = message.color;
			if(color.nameColor!=undefined){
				$strong.css('color', color.nameColor);
			}
			if(color.backgroundName!=undefined){
				$strong.css('background',color.backgroundName);
			}
			if(color.textColor!=undefined){
				$text.css('color', color.textColor);
			}
			if(color.textBackground!=undefined){
				$text.css('background-color',color.textBackground);
			}
		}
	}
	if(message.kickable && state.permissions.kick)
		$p.append($kick);
	if(state.permissions.Admin)
	    $p.append($admin);
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
    		body: strip(message.chat)
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
		text = message.user +' entered the room';
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
	}
	else if(message.alert=='success'){
		text = '<div class="alert alert-success">'+message.text+'</div>';
	}else if(message.alert == 'new message'){
		
		text = '<div class="alert alert-info">'+message.from+' says: '+message.message+'</div>';
	}
	$('#chatArea').append($('<div></div>').append(text));
	height+=400;
	$('#chatArea').scrollTop(height);
	socket.emit('me',{});
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
	var $a = $('<a href="/u/'+message.user_id+'" target="_blank"></a>');
	var $strong = $('<strong></strong>');
	var $img = $('<img></img>');
	var $link = $('<a></a>');
	var image_regex = new RegExp(/(png|jpg|jpeg|gif)$/g);
	if (message.file.name.match(image_regex)){
	$img.attr('src',message.file.file_data);
	$img.addClass('drag_image');
	$link.attr('href',message.file.file_data);
	$link.attr('target','blank');
	$link.append($img);
	}else{

	$link.attr('href','data:Application/octet-stream,' +encodeURIComponent(message.file.file_data));
	$link.attr('download',message.file.name);
	$link.text( message.file.name);
	}
	var $small = $('<small></small>');
	var $time = $('<small></small>');
	var $kick  = $('<a href="#" data-toggle="modal" data-target="#ban" ><span class="glyphicon glyphicon-ban-circle text-danger"></span>&nbsp;</a>');
	var $admin = $('<a href="#" data-toggle="modal" data-target="#admin"><span class="glyphicon glyphicon-cog"></span>&nbsp;</a>');
	$kick.click(function(event) {
		bannie_id=message.user_id;
	});
	$admin.click(function(event){
	   bannie_id=message.user_id; 
	});
	if(message.rank != 'User')
		$small.append('['+message.rank+'] ');
	$strong.text(message.user+": ");
	$small.addClass('chat_rank');
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

	if(message.kickable && state.permissions.kick)
		$p.append($kick);
	if(state.permissions.Admin)
	    $p.append($admin);
	$p.append($small);
	$a.append($strong);
    $p.append($a);
	$p.append($time);
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
		if (room && canEnterRoom(state, room)) {
						if (!(room.requirements != undefined && room.requirements.hasPassword)) {
							inRoom=true;
							socket.emit('join-room', {
								roomId: room.id
							});	
							$('#registerButton,#addRoomButton').slideUp();

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
};

$(document).ready(function() {
	$('#submit_points').click(function(event) {
		socket.emit('points',{user_id:bannie_id,amount:Number($('#give_points').val())});
	});
	$('.rank-button').click(function(event) {
		socket.emit('change_rank',{user_id:bannie_id,group:Number($(this).data('group'))});
	});
    $('#messageTabs a').click(function(e){
       $(this).tab('show');
    });
    $('#messageTabs a:first').tab('show');

	$('#styleSelect>li>a').click(function(event) {
				$('link').attr('href', $(this).attr('rel'));
				$.cookie('css', $(this).attr('rel'), {
					path: '/',
					expires: 1000
				});
			});
	if ($.cookie('css')) {
				$('link').attr('href', $.cookie('css'));
			}
	$('#chatBox').keypress(function(event) {
				startTyping();
			});
	$('#restart').click(function(event) {
				socket.emit('restart', {});
			});
	$(document).on('click', 'room-button', function(event) {


				var target = $(event.target);
				if (!target.hasClass('btn')) {
					var data = $(this).data('roomData');
					if (canEnterRoom(state, data)) {
						if (!(data.requirements != undefined && data.requirements.hasPassword)) {
							inRoom=true;
							socket.emit('join-room', {
								roomId: $(this).data('roomData').id
							});
							window.history.pushState("", "", '?room='+$(this).data('roomData').name);
							$('#addRoomButton').slideUp();

							$('#rooms').animate({
								left: "-100%"
							}, 500, function() {
								$('#title').text(data.name);
								$('#room,#clearChat').slideDown();
								angular.element('#room').scope().room = data;
								angular.element('#room').scope().$apply();
							});
							$('#leaveRoom').show();
						} else {
							angular.element(this).scope().showPasswordInput = true;
							angular.element(this).scope().$apply();
						}
					}
				}
			});
	$('#leaveRoom').click(function(event) {
		inRoom=false;
				$('#leaveRoom').hide();
				window.history.pushState("", "","/chat.html");
				if (state.username != undefined)
					$('#title').text('Welcome ' + state.username + "!");
				else
					$('#title').text('Welcome user! Please Login');
				socket.emit('leave room', {});
				$('#registerButton,#addRoomButton').slideDown();
				$('#room,#clearChat').slideUp('400', function() {
					$('#chatArea').children().not('#typing').remove();
				});
				$('#rooms').animate({
					left: "0%"
				}, 500, function() {});

			});
	$('#clearChat').click(function(event) {
				$('#chatArea').children().not('#typing').remove();
			});
	$('#room').on('drop', function(event) {
				event.preventDefault();
				var files = event.originalEvent.dataTransfer.files;
				sendFiles(files);
			});
	$('#room').bind('paste',function(e,b,c){
				var items = e.originalEvent.clipboardData.items;
				var files = [];
				for(var i =0;i<items.length;i++){
						files.push(items[i].getAsFile());
				}
				sendFiles(files);
			});
	var sendFiles = function(files){
				var reader = new FileReader();
				var name;

				reader.onloadend = function() {

					socket.emit('sendFile', {file_data:reader.result,name:name});
				}
				for (var i = 0; i < files.length; i++) {
					if(files[i]!=null){
					if (files[i].size < 1024 * 1024 * 5){
						name = files[i].name.toLowerCase();
						var image_regex = new RegExp(/(png|jpg|jpeg|gif)$/g);
						if (name.match(image_regex))
							reader.readAsDataURL(files[i]);
						else
							reader.readAsText(files[i],'UTF-8');
					}
					else
						$('#chatArea').append('<p class="text-danger">File is too large, it must be less than 5 MB</p>')
						}
				}
			}
	$(document).on('drop', function(e) {
				e.stopPropagation();
				e.preventDefault();
			});
    $(document).on('dragenter', function(e) {
				e.stopPropagation();
				e.preventDefault();
			});
	$(document).on('dragover', function(e) {
				e.stopPropagation();
				e.preventDefault();
			});
     $(document).keydown(function(e){
       switch (e.which){
           case 38: //up
               if(lastSendId==-1){
                   lastSendId=sent.length-1;
               }else if(lastSendId!=0){
                   lastSendId--;
               }
               $('#chatBox').val(sent[lastSendId]);
               break;
           case 40: //down
                  if(lastSendId==-1){
                   lastSendId=sent.length-1;
               }else if(lastSendId+1!=sent.length){
                   lastSendId++;
               }
               $('#chatBox').val(sent[lastSendId]);
               break;
           default:
           return;
       }
        e.preventDefault();
    });
     $(document).on('click','.historyItem', function (e) {
       $('#chatBox').val(e.currentTarget.text);
    });
	var handleHistory = function(message){
		sent.push(message);
		var historyItems = $('.historyItem');
		if(historyItems.length>=10){
			for(var i =0;i<=historyItems.length-10;i++)
			 $('#sentHistory').children().first().remove();
		}
                    $('#sentHistory').append("<li><a class='historyItem'>" +
                        message +
                        "</a></li>"); 
	};
	$('.command-btn').on('click','',function(e){
	    var type = $(this).data('command');
	    switch(type){
	        case 'sat-question':
	            socket.emit('sat',{type:'question'});
	            $('#chatBox').focus();
	            break;
	         case 'sat-word':
	            socket.emit('sat',{type:'word'});
	            $('#chatBox').focus();
	            break;
	        case 'spanish':
	            socket.emit('spanish');
	            $('#chatBox').focus();
	            break;
	        case 'answer':
	            $('#chatBox').val('!answer ');
	            $('#chatBox').focus();
	            break;
	        case 'sat-define':
	            $('#chatBox').val('!satDefine ');
	            $('#chatBox').focus();
	            break;
	        case 'apush':
	        	socket.emit('question',{class:"APUSH"});
	        	$('#chatBox').focus();
	        	break;
	        case 'econ':
	        	socket.emit('question',{class:"ECON"});
	        	$('#chatBox').focus();
	        	break;
	    }
	})
    $('#chatButton').on('click','',function(e){
        var message = $('#chatBox').val();
        lastSendId=-1;
       if(state.status==='Logged in')
	    		{
                     handleHistory(message);
					if(message.indexOf('!word') == 0 && state.permissions.words){
                        var number = Number(message.match(new RegExp(/\d+/))[0]);
                        if (number==0)
                            number=1;
						socket.emit('random',{count:number,type:'words'});
					}else if(message.indexOf('!funny') == 0 && state.permissions.words){
						socket.emit('random',{count:1,type:'funny'});
					
					}else if(message.indexOf('!satWord') == 0 && state.permissions.words){
						socket.emit('sat',{type:'word'});
					}
				else if(message.indexOf('!satDefine') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'define',word:message.substring('!satDefine'.length+1)});
					}
					else if(message.indexOf('!satSentence') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'sentence',word:message.substring('!satSentence'.length+1)});
					}
					else if(message.indexOf('!satHelp') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'help'});
					}
					else if(message.indexOf('!satQuestion') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'question'});
					message = "!answer ";
					}
					else if(message.indexOf('!satQ') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'question'});
					message = '!satA ';
					}
					else if((message.indexOf('!spanishConjugations')==0 || message.indexOf('!sc') == 0) && state.permissions.chat){
					socket.emit('spanish');
					message = '!answer ';
					}
					else if((message.indexOf('!APUSHQ') == 0) && state.permissions.chat){
						socket.emit('question',{class:"APUSH"});
					}
					else if((message.indexOf('!ECONQ') == 0) && state.permissions.chat){
						socket.emit('question',{class:"ECON"});
					}
                    else if(message.indexOf('!answer') == 0 && state.permissions.chat){
					    checkAnswer(message.substr('!answer'.length+1));
					    
					}
					else if(message.indexOf('!satA') == 0 && state.permissions.chat){
					    checkAnswer(message.substr('!satA'.length+1));
					}
                    else{
				socket.emit('chat',{'chat':message});
				socket.emit('stopTyping',{});
				$('#chatBox').val('');
					
			}
				} 
    });

});


function forgot(){
	var username = $('#forgot input').val();
	$.post('/forgot-request',{"username":username},function(data, textStatus, xhr){});
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
function strip(html)
{
   var tmp = document.createElement("DIV");
   tmp.innerHTML = html;
   return tmp.textContent || tmp.innerText || "";
}