var state ={};
function getState(){
	$.post('/me', {}, function(data, textStatus, xhr) {
		console.log(data);
		state =data;
	},'json');
}