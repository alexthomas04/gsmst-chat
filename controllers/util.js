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
				console.log(scope);
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

			}
			scope.toggleDelete=function(){
				deleteAble = !deleteAble;
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
			}
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
			}
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
				socket.emit('chat',{'chat':scope.message});
				socket.emit('stopTyping',{});
				scope.message='';
			}
				
				
			}
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
				scope.showRankState='show'
			if(settings.showTime)
				scope.showTimeState='hide';
			else
				scope.showTimeState='show'
		}
		updateShows();
		scope.toggleTime=function(){
			settings.showTime=!settings.showTime;
			updateShows();
		}
		scope.toggleRank=function(){
			settings.showRank=!settings.showRank;
			updateShows();
		}

			scope.saveSettings = function(){
				updateSettings();
			};
		}	
	};
}])
