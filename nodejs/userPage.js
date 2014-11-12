/**
 * Created by Sonicdeadlock on 11/4/2014.
 */



var getData = function(connection,user_id,callback){
    connection.query('SELECT * FROM users WHERE id = '+user_id+' LIMIT 1',function(err,result){
        if(result && result.length>0) {
            var user = result[0];
            var data = {};
            data.name = user.first_name + ' ' + user.last_name;
            data.username = user.username;
            connection.query('SELECT * FROM sessions WHERE user_id = ' + user_id, function (err1, result1) {
                var onlineTime = 0;
                for (var i = 0; i < result1.length; i++) {
                    onlineTime += result1[i].duration;
                }
                var seconds = Math.floor(onlineTime / 1000);
                var minutes = Math.floor(seconds / 60);
                var hours = Math.floor(minutes / 60);
                var days = Math.floor(hours / 24);
                var time = '';
                if (days > 0)
                    time += days + " days ";
                if (hours > 0)
                    time += hours % 24 + ' hours ';
                if (minutes > 0)
                    time += minutes % 60 + ' minutes ';
                if (seconds > 0)
                    time += seconds % 60 + ' seconds';
                data.onlineTime = time;

                connection.query('SELECT * FROM chat WHERE user_id=' + user_id, function (err2, result2) {
                    data.chatCount = result2.length;
                    words = [];
                    letters = [];
                    for (var i = 0; i < result2.length; i++) {
                        var text = result2[i].message;
                        var wordsTemp = text.split(' ');
                        for (var j = 0; j < wordsTemp.length; j++) {
                            var word = wordsTemp[j];
                            if (words[word])
                                words[word]++;
                            else
                                words[word] = 1;
                            for (var k = 0; k < word.length; k++) {
                                if (letters[word[k]])
                                    letters[word[k]]++;
                                else
                                    letters[word[k]] = 1;
                            }
                        }
                    }
                    data.lurk = Math.floor(onlineTime / data.chatCount);
                    data.word = getHighest(words);
					data.wordUses = words[data.word];
					delete words[data.word];
					data.wordnd = getHighest(words);
					data.wordUsesnd = words[data.wordnd];
					delete  words[data.wordnd];
					data.wordrd = getHighest(words);
					data.wordUsesrd = words[data.wordrd];
                    data.letter = getHighest(letters);
                    
                    data.letterUses = letters[data.letter];
                    connection.query('SELECT * from kicks WHERE user_id = ' + user_id, function (err, res) {
                        data.bans = res.length;
                        callback(data);
                    });


                });
            });

        }
        else{
            return {};
        }
    });
};

var getHighest = function(object){
    var highestIndex='';
    var highestValue=0;
	var array = Object.keys(object);
    for(var i=0;i<array.length;i++){
        if(object[array[i]]>highestValue){
			highestIndex = array[i];
			highestValue= object[array[i]];
		}
    }
    return highestIndex;
};

var remove = function(array,value){
	
}

module.exports={
	getUserData:getData
}