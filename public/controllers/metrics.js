var app = angular.module('metrics', {
	setup: function() {
		// setup for metrics 
	},
	teardown: function() {
		//teardown for metrics
	}
});

var setProgress = function(id, percent, text) {
	var bar = $('#' + id);
	bar.removeClass('progress-bar-success progress-bar-warning progress-bar-danger progress-bar-info');
	if (percent < 30)
		bar.addClass('progress-bar-danger');
	else if (percent < 60)
		bar.addClass('progress-bar-warning');
	else if(percent==100)
		bar.addClass('progress-bar-success');
	else
		bar.addClass('progress-bar-info');
	bar.css('width', percent + '%').attr('aria-valuenow', percent);
	percent = Math.floor(percent * 1000) / 1000;
	bar.children().filter('span').text(percent + "% " + text);
};

app.filter('millSecondsToTimeString', function() {
	return function(millseconds) {
		var seconds = Math.floor(millseconds / 1000);
		var days = Math.floor(seconds / 86400);
		var hours = Math.floor((seconds % 86400) / 3600);
		var minutes = Math.floor(((seconds % 86400) % 3600) / 60);
		seconds = seconds % 60;
		var timeString = '';
		if (days > 0) timeString += (days > 1) ? (days + " days ") : (days + " day ");
		if (hours > 0) timeString += (hours > 1) ? (hours + " hours ") : (hours + " hour ");
		if (minutes > 0) timeString += (minutes > 1) ? (minutes + " minutes ") : (minutes + " minute ");
		if (seconds >= 0) timeString += (seconds > 1) ? (seconds + " seconds ") : (seconds + " second ");
		return timeString;
	};
});

app.controller('metricsCtrl', ['$scope',
	function($scope) {
		var handleJSON = function(json) {
			$scope.metrics = json;
			var increment = 500;
			var userCount = 0,
				wordCount = 0,
				letterCount = 0,
				roomCount = 0,
				timeCount = 0,
				sessionCount = 0;
			var total_count = 0;

			total_count += json.rooms.length;
			total_count += json.userActivity.length;
			total_count += json.letters.length;
			total_count += json.time.length;
			total_count += json.sessions.length;
			total_count += json.lurkFactor.length * json.users.length;
			total_count += json.userActivity.length * json.users.length;
			total_count += json.sessions.length * json.users.length;
			total_count += json.words.length * 3;
			var counter = 0;
			var incrementAndUpdate = function(text) {
				text = text || '';
				counter++;
				setProgress('loadProgress', counter * 100 / total_count, text);
			};
			var performSection = function(start, stop, func, callback) {
				for (var i = start-1; i >stop ; i--) {
					func(i);
				}
				callback(stop, func);
			};
			var performWordSection = function(current, func, next) {
				var timeoutFunc = function(one, two) {
					setTimeout(function() {
						performWordSection(one, two, next);
					}, 20);
				};
				var length = json.words.length;
				if (current > 0) {
					if (current - increment > 0)
						performSection(current, current - increment, func, timeoutFunc);
					else
						performSection(current, 0, func, timeoutFunc);
				} else
					next();
			};
			var async = function(f) {
				setTimeout(f, 0);
			};
			var wait = function(f) {
				setTimeout(f, 50);
			};

			async(function() {
				$.each(json.rooms, function(index, val) {
					roomCount += val.value;
					incrementAndUpdate('Calculating Rooms Frequency');
				});
				$scope.roomCount = roomCount;
			});
			async(function() {
				wait(function() {
					$.each(json.userActivity, function(index, val) {
						userCount += val.value;
						incrementAndUpdate('Calcuating User Activity');
					});
					$scope.userCount = userCount;
				});
			});
			async(function() {
				wait(function() {
					$.each(json.letters, function(index, val) {
						letterCount += val.value;
						incrementAndUpdate('Calcuating Letter Frequency');
					});
					$scope.letterCount = letterCount;
				});
			});
			async(function() {
				wait(function() {
					$.each(json.time, function(index, val) {
						timeCount += val.value;
						incrementAndUpdate("Calculating Time Frequency");
					});
					$scope.timeCount = timeCount;

				});
			});
			async(function() {
				wait(function() {
					$.each(json.sessions, function(index, val) {
						sessionCount += val.value;
						incrementAndUpdate("Calculating Session Time");
					});
					$scope.sessionCount = sessionCount;
				});
			});
			async(function() {
				wait(function() {
					for (var i = 0; i < $scope.metrics.userActivity.length; i++) {
						var userData = $scope.metrics.userActivity[i];
						for (var j = 0; j < json.users.length; j++) {
							if (json.users[j].id == userData.key)
								$scope.metrics.userActivity[i].key = json.users[j].username;
							incrementAndUpdate("Applying Usernames");
						}
					}
				});
			});
			async(function() {
				wait(function() {
					for (var i = 0; i < $scope.metrics.sessions.length; i++) {
						var userData = $scope.metrics.sessions[i];
						for (var j = 0; j < json.users.length; j++) {
							if (json.users[j].id == userData.key)
								$scope.metrics.sessions[i].key = json.users[j].username;
							incrementAndUpdate("Applying Usernames");
						}
					}
				});
			});
			async(function() {
				wait(function() {
					for (var i = 0; i < $scope.metrics.lurkFactor.length; i++) {
						var userData = $scope.metrics.lurkFactor[i];
						for (var j = 0; j < json.users.length; j++) {
							if (json.users[j].id == userData.key)
								$scope.metrics.lurkFactor[i].key = json.users[j].username;
							incrementAndUpdate("Applying Lurk Factor");
						}
					}
				});
			});
			async(function() {
				wait(function() {
					performWordSection($scope.metrics.words.length, function(i) {
						var val = json.words[i];
						wordCount += val.value;
						$scope.wordCount = wordCount;
						incrementAndUpdate("Word Counting");
					}, function() {
						performWordSection($scope.metrics.words.length, function(i) {
							var word = $scope.metrics.words[i];
							if (word.key.length > 30) {
								word.tooltip = word.key;
								word.key = word.key.substring(0, 30);
							}
							$scope.metrics.words[i] = word;
							incrementAndUpdate("Word Shortening");
						}, function() {
							performWordSection($scope.metrics.words.length,function(i){
								var word = $scope.metrics.words[i];
								if(word.value/$scope.wordCount*100<.001){
									$scope.metrics.words.splice(i,1);
									
								}
								incrementAndUpdate("Removing Uncommon Words");
							},function(){$scope.$apply();setProgress('loadProgress',100,'Complete');});
							
						});
					});
				});
			});
			async(function(){
				wait(function(){
					
				});
			});
		};
		/* 	$.getJSON('metrics.json', {}, function(json, textStatus) {
			handleJSON(json);
	}); */
		$.ajax({
			method: 'GET',
			url: 'metrics.json',
			dataType: 'json',
			success: function(data) {
				setTimeout(function() {
					handleJSON(data);
				}, 100);
			},
			error: function() {},
			progress: function(e) {
				//make sure we can compute the length
				if (e.lengthComputable) {
					//calculate the percentage loaded
					var pct = (e.loaded / e.total) * 100;

					setProgress('downloadProgress', pct,"Downloaded");
				}
				//this usually happens when Content-Length isn't set
				else {
					console.warn('Content Length not reported!');
				}
			}
		});
	}
]);