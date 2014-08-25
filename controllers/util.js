var app = angular.module('util',[]);

app.directive('errors', [function () {
	return {
		restrict: 'E',
		templateUrl:'templates/error.html'
	};
}]);

app.directive('login', [function () {
	return {
		restrict: 'E',
		templateUrl:'templates/login.html',
		link: function (scope, iElement, iAttrs) {
			scope.login = function(){
				socket.emit('login',{'username':scope.username,'password':scope.password});
			};

			socket.on('me',function(message){
				scope.state = state;
				scope.$apply();
				console.log(message);
				if(scope.rememberMe)
				$.cookie('hash',message.hash,{
					path: '/',
					expires: 1
				});
			});
			
		}
	};
}]);


app.directive('addroom', [function () {
	return {
		restrict: 'A',
		link: function (scope, iElement, iAttrs) {
			var deleteAble = true;
			scope.reqRank='Guest';
			scope.addRoom=function(){
				var data = {};
				data.name = scope.roomName;
				if(scope.roomPassword != "" && scope.roomPassword!=undefined){
					data.hasPassword=true;
					data.password=scope.roomPassword;
				}
				else{
					data.hasPassword=false;
				}
				data.rank=scope.reqRank;
				data.isDeleteable = deleteAble;

				socket.emit('addRoom',data);

				//reset form
				scope.roomName = "";
				deleteAble = true;
				$('isDeleteable').addClass('active');
				scope.roomPassword='';

			};
			scope.toggleDelete=function(){
				deleteAble = !deleteAble;
				$('#isDeleteable').toggleClass('btn-danger').toggleClass('btn-success');
			};
		}
	};
}]);

app.directive('roomButton', [function () {
	return {
		restrict: 'E',
		templateUrl:"templates/roomButton.html",
		link: function (scope, iElement, iAttrs) {
			
			$(iElement).data('roomData',scope.room);
			scope.deleteRoom = function(id){
				socket.emit('deleteRoom',{"id":id});
			};
			scope.enterRoom=function(){
				if(canEnterRoom(state,scope.room)){
				socket.emit('join-room',{roomId:scope.room.id,password:scope.roomPassword});
	    			$('login,#addRoomButton').slideUp();
	    			$('#rooms').animate({left:"-100%"}, 500,function(){
	    				$('#title').text(scope.room.name);
	    				$('#room').slideDown();
	    				angular.element('#room').scope().room =scope.room;
	    				angular.element('#room').scope().$apply();
	    			});
	    			$('#leaveRoom').show();
	    		}
			};
		}
	};

}]);

app.directive('room', [function () {
	return {
		restrict: 'A',
		link: function (scope, iElement, iAttrs) {
			scope.chat = function(){
				if(state.status==='Logged in')
	    		{
					if(scope.message.indexOf('!word') == 0 && state.permissions.words){
                        var number = Number(scope.message.match(new RegExp(/\d+/))[0]);
                        if (number==0)
                            number=1;
						socket.emit('random',{count:number,type:'words'});
					}else if(scope.message.indexOf('!funny') == 0 && state.permissions.words){
						socket.emit('random',{count:1,type:'funny'});
					
					}else if(scope.message.indexOf('!satWord') == 0 && state.permissions.words){
						socket.emit('sat',{type:'word'});
					}
				else if(scope.message.indexOf('!satDefine') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'define',word:scope.message.substring('!satDefine'.length+1)});
					}
					else if(scope.message.indexOf('!satSentence') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'sentence',word:scope.message.substring('!satSentence'.length+1)});
					}
					else if(scope.message.indexOf('!satHelp') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'help'});
					}
					else if(scope.message.indexOf('!satQuestion') == 0 && state.permissions.chat){
					socket.emit('sat',{type:'question'});
					}
                    else if(scope.message.indexOf('!answer') == 0 && state.permissions.chat){
					    checkAnswer(scope.message.substr('!answer'.length+1));
					}
                    else{
				socket.emit('chat',{'chat':scope.message});
				socket.emit('stopTyping',{});
				scope.message='';
					
			}
				}
				
				
			};
		}
	};
}]);

app.directive('settings', [function () {
	return {
		restrict: 'A',
		link: function (scope, iElement, iAttrs) {
			scope.showRankState='hide';
			scope.showTimeState='hide';
			var updateShows=function(){
			if(settings.showRank)
				scope.showRankState='hide';
			else
				scope.showRankState='show';
			if(settings.showTime)
				scope.showTimeState='hide';
			else
				scope.showTimeState='show';
		};
		updateShows();
		scope.toggleTime=function(){
			settings.showTime=!settings.showTime;
			updateShows();
		};
		scope.toggleRank=function(){
			settings.showRank=!settings.showRank;
			updateShows();
		};

			scope.saveSettings = function(){
				updateSettings();
			};
		}	
	};
}]);
app.directive('report', [function () {
	return {
		restrict: 'A',
		link: function (scope, iElement, iAttrs) {
			scope.report = function(type){
				socket.emit('report',{name:scope.name,email:scope.email,report:scope.info,'type':type});
			};
		}
	};
}]);
app.directive('send', [function () {
	return {
		restrict: 'A',
		link: function (scope, iElement, iAttrs) {
			scope.sendPrivate = function(type){
				socket.emit('private',{to_username:scope.to,message:scope.privateMessage});
				scope.privateMessage='';
				scope.to='';
			};
		}
	};
}]);
app.directive('inbox', [function () {
	return {
		restrict: 'A',
		link: function (scope, iElement, iAttrs) {
			scope.deletePrivate = function(id){
				socket.emit('deletePrivate',{"id":id});
			};
			scope.replyToPrivate=function(to){
				scope.to=to;
			};
			
		}
	};
}]);

