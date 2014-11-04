var app = angular.module('metrics', {
  setup: function() {
    // setup for metrics 
  },
  teardown: function() {
    //teardown for metrics
  }
});

app.filter('millSecondsToTimeString', function() {
  return function(millseconds) {
    var seconds = Math.floor(millseconds / 1000);
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var minutes = Math.floor(((seconds % 86400) % 3600) / 60);
    seconds = seconds % 60;
    var timeString = '';
    if(days > 0) timeString += (days > 1) ? (days + " days ") : (days + " day ");
    if(hours > 0) timeString += (hours > 1) ? (hours + " hours ") : (hours + " hour ");
    if(minutes > 0) timeString += (minutes > 1) ? (minutes + " minutes ") : (minutes + " minute ");
    if(seconds >= 0) timeString += (seconds>1) ? (seconds+" seconds ") : (seconds+" second ");
    return timeString;
}
});

app.controller('metricsCtrl', ['$scope', function ($scope) {
	$.getJSON('metrics.json', {}, function(json, textStatus) {
			console.log(json);
			$scope.metrics=json;
			var userCount=0,wordCount=0,letterCount=0,roomCount=0,timeCount=0,sessionCount=0;
			$.each(json.words, function(index, val) {
				wordCount+=val.value;
			});
			$.each(json.rooms, function(index, val) {
				roomCount+=val.value;
			});
			$.each(json.userActivity, function(index, val) {
				userCount+=val.value;
			});
			$.each(json.letters, function(index, val) {
				letterCount+=val.value;
			});
			$.each(json.time, function(index, val) {
				timeCount+=val.value;
			});
			$.each(json.sessions, function(index, val) {
				sessionCount+=val.value;
			});
			for(var i=0;i<$scope.metrics.userActivity.length;i++){
				var userData = $scope.metrics.userActivity[i];
				for(var j=0;j<json.users.length;j++){
					if(json.users[j].id==userData.key)
						$scope.metrics.userActivity[i].key=json.users[j].username;
				}
			}
			for(var i=0;i<$scope.metrics.sessions.length;i++){
				var userData = $scope.metrics.sessions[i];
				for(var j=0;j<json.users.length;j++){
					if(json.users[j].id==userData.key)
						$scope.metrics.sessions[i].key=json.users[j].username;
				}
			}
			for(var i=0;i<$scope.metrics.lurkFactor.length;i++){
				var userData = $scope.metrics.lurkFactor[i];
				for(var j=0;j<json.users.length;j++){
					if(json.users[j].id==userData.key)
						$scope.metrics.lurkFactor[i].key=json.users[j].username;
				}
			}

			for (var i = $scope.metrics.words.length - 1; i >= 0; i--) {
				var word = $scope.metrics.words[i];
				if(word.key.length>30){
					word.tooltip= word.key;
					word.key = word.key.substring(0,30);
				}
				$scope.metrics.words[i]=word;
			};
			$scope.wordCount=wordCount;
			$scope.roomCount=roomCount;
			$scope.userCount=userCount;
			$scope.letterCount=letterCount;
			$scope.timeCount = timeCount;
			$scope.sessionCount=sessionCount;
			$scope.$apply();
	});
}])
