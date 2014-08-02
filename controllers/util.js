var app = angular.module('util',[]);

app.directive('errors', [function () {
	return {
		restrict: 'E',
		templateUrl:'templates/error.html'
	};
}])

app.directive('login', [function () {
	return {
		restrict: 'E',
		templateUrl:'templates/login.html',
		link: function (scope, iElement, iAttrs) {
			scope.submit = function(){
				$.post('/login', {'username':scope.username,'password':scope.password}, function(data, textStatus, xhr) {
					getState();
					if(data.status == "OK")
                        scope.state.status='Logged in';
                    scope.$apply();
				});

			};
			scope.state = state;
		}
	};
}])

