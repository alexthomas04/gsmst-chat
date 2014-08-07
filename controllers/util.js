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
		restrict: 'E',
		templateUrl:'templates/addRoom.html',
		link: function (scope, iElement, iAttrs) {
			scope.addRoom=function(){
				var data = {};
				data.name = scope.roomName;
				socket.emit('addRoom',data);
				scope.roomName = "";
				$(iElement).hide();
			}
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
}])
