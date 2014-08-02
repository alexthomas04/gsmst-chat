/**
 * Created by Sonicdeadlock on 8/1/2014.
 */
var app = angular.module('register',['error']);

app.controller('RegisterCtrl',['$scope',function($scope){
    $scope.submit = function(){
        var values = {};
        var fields = ['username','password','repassword','firstname','lastname','email'];
        for (var i = fields.length - 1; i >= 0; i--) {
        	var field = fields[i];
        	values[field]=$scope[field] ;
        };
        values = values || {};
        $.post('reguser',values,function(data){
        	if(data.status==='OK'){
        		window.location.assign(data.redirect);
        	}
        	else{
        		angular.element('errors').scope().errors = data.errors;
        		angular.element('errors').scope().$apply();
        	}
        });
    };
}]);

