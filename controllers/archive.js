var app= angular.module('archive',[]);

app.controller('ArchiveCtrl', ['$scope', function ($scope) {
	this.username='';
	this.password='';
	this.selected=[];
	var storedType;
	this.range={start:0,length:100};
	this.where={};
	this.order = {'direction':"ASC",'by':'id'};
	this.login = function(){
		$.post('/login',{username:this.username,password:this.password} , function(data, textStatus, xhr) {
			if(data.status=='OK'){
				$('#login').hide();
				$('#error').hide();
			}
		});
	};
	this.select = function(type){
		type = type || storedType;
		storedType = type;
		 
		var self = this;
		$.post('archive',{blarg:JSON.stringify( {'type':type,'range':self.range,order:self.order,where:self.where})}, function(data, textStatus, xhr) {
			if(data.success){
				$('#error').hide();
				self.selected = data.info;
				$scope.$apply();
			}else{
				$('#error').show();
				$('#error>p>span').text(data.message);
			}
		});
	}

	
}]);