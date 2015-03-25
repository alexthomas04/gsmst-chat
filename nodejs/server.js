/**
 * Created by Sonicdeadlock on 8/1/2014.
 */

//set up server

var fs = require('fs');
var config = JSON.parse(fs.readFileSync('nodejs/config.json', 'utf8'));
var port = config.port || 3000;

var express = require('express');
var app = express();
var server = require('http').createServer(app);
var http = require('http');
var https = require('https');
var socketSessions = require('socket.io-handshake');

var bodyParser = require('body-parser');
var mysql = require('mysql');
var crypto = require('crypto');
var cookieParser = require('cookie-parser');
var session = require('express-session');
//var RedisStore = require('connect-redis')(session);
var validator = require('validator');
var io = require('socket.io')(server);
var simplesmtp = require('simplesmtp');
var userData = require('./userPage');
var net = require('net');
var dgram = require('dgram');



//set-up various mySQL connections
// the mutipule connections allows for the other operations not to be blocked by the chat inserting
var connection = mysql.createConnection(config.mysql);
var connectionRead = mysql.createConnection(config.mysql);
var connectionChat = mysql.createConnection(config.mysql);
connection.connect(function(err) {
	console.log(err);
});


var rooms = [];
var users = [];
var groups = [];
var blacklistRegex='';
var botsend = dgram.createSocket('udp4');
var bot_port = 8888;
botsend.bind(bot_port);


//handle when a bot recives a message
botsend.on('message',function(data,remote){
    data = JSON.parse(data);
    data.kickable = false;
    data.time = new Date();
    data.user_id = -2;
    var room = getRoomById(data.room_id)
    matching = getUsersByRoom(room);
    for (var i = matching.length - 1; i >= 0; i--) {
        var match = matching[i];
        match.socket.emit('chat', data);
    }
});
//routing

app.use(bodyParser.urlencoded({
	extended: false
}));
app.use(cookieParser());
app.use(bodyParser.json());
var sessionStore = new session.MemoryStore;
//var sessionStore = new RedisStore();
app.use(session({
	secret: 'gsmstchat',
	store: sessionStore
}));
app.set('view engine','jade');


var loc = __dirname;
loc = loc.split('\\');
loc.pop(loc.length - 1);
loc = loc.join('\\');
if (config.useDirName)
	app.use(express.static(loc));
else
	app.use(express.static(config.dir));

//io.use( socketSessions({store: sessionStore, key:'sid', secret:'gsmstchat', parser:cookieParser()}));

server.listen(port, function() {
console.log("Server listening at port %d", port);
});
io.emit('alert', {
	'alert': 'info',
	'text': 'The server just restarted. Please refresh'
});

//event fired when client connects
io.on('connection', function(socket) {
	var user;
	
	//inform the client that they have connected
	socket.emit('connected',{});

	//event fired when the client disconnects
	socket.on('disconnect', function() {

		if (user !== undefined) {
			//calculate and insert the user session length
			var sessionLength = (new Date())-user.sessionStart;
			connection.query('INSERT INTO sessions SET ?',{user_id:user.id,duration:sessionLength});

			//let the other users in the room know that the user left
			var matching = getUsersByRoom(user.room);
			for (var i = matching.length - 1; i >= 0; i--) {
				var match = matching[i];
				match.socket.emit('alert', {
					"alert": "left",
					'user': user.username
				});
			};
			user.room = undefined;
			user.socket = undefined;
			emitRooms();
		}
	});


	socket.on('login', function(message) {
		//check to see if the user has a registered hash
		getUserFromHash(message.hash, function(callbackUser) {
			if (callbackUser == undefined) {
				//if not, check to see if they have a valid username and password
				login(message.username, message.password, function(success) {
					if (success) {
						//if the client was previouly connected reset the connection
						if (user !== undefined) {
							user.socket = undefined;
						}
						//init the user
						getUser(message.username, function(param) {
							user = param;
							user.sessionStart = new Date();
							user.socket = socket;
							user.hash = crypto.randomBytes(50).toString('base64');
							users.push(user);
							emitSelf(socket);
						});


					}
				});
			} else {//if the user has a valid hash
				
				if (user !== undefined) {
					user.socket = undefined;
				}
				//init user
				user = callbackUser
				user.sessionStart = new Date();
				user.socket = socket;
				user.hash = crypto.randomBytes(50).toString('base64');
				users.push(user);
				emitSelf(socket);
			}
		});

	});

	socket.on('join-room', function(message) {
		
		var canEnterRoom = function(user, room, callback) { //function to check to see if the user can enter the room
			if (user != undefined && user.permissions != undefined && user.permissions.god) // if the user is valid or can override the validation proccess
				callback(true);//the user can enter the room
			else {
				isBanned(user, room, function(banned) { // check to see if the user is currently banned from the room
					if (banned)
						callback(false);//the user can not enter the room
					else {
						if (room.requirements) {
							if (room.requirements.rank) {

								if (!user || user.permissions == undefined || !(user.permissions[room.requirements.rank])) // if the user meets the room's rank requirements
									callback(false);// the user can not enter the room

							}
							if (room.requirements.hasPassword && message.password != room.requirements.password) { //if the client meets the room's password requirements
								callback(false);// the user can not enter the room
							}
						}

						callback(true);// the user can enter the room.
					}
				});
			}


		};


		var room = getRoomById(message.roomId);
		if (room != undefined) {
			canEnterRoom(user, room, function(canEnter) {
				if (canEnter) {//if the user can enter the room
					if (user != undefined && user.room == undefined) {//if the user and room are valid
						user.room = room;
						emitRooms();
						if (user.room != undefined && user.room.id >= 0) { // the user can enter the room
							//get an appropreate entrance message for the class of user
							connection.query('Select `entrance` from `entrances` where group_id=' + user.group_id, function(err, result) {
								var matching = getUsersByRoom(user.room);//get the other users in the room
								for (var i = matching.length - 1; i >= 0; i--) {//foreach user
									var match = matching[i];
									var entrance;
									if (result != undefined && result.length > 0) {
										entrance = result[Math.floor(Math.random() * result.length)].entrance;//select a random entrance message
									}
									match.socket.emit('alert', { //inform the current users of the room that the user has entered
										"alert": "entered",
										'user': user.username,
										"entrance": entrance
									});
								};

							});
						}
					} else {//enter as a guest
						//create a blank user
						user = {};
						user.room = getRoomById(message.roomId);
						user.socket = socket;
						user.group_id = 0;
						users.push(user);
						emitRooms();
						if (user.room != undefined && user.room.id >= 0) {
							connection.query('Select `entrance` from `entrances` where group_id=' + user.group_id, function(err, result) {//get an appropreate entrance message for the class of user
								var matching = getUsersByRoom(user.room);//get the other users in the room
								for (var i = matching.length - 1; i >= 0; i--) {//foreach user
									var match = matching[i];
									var entrance;
									if (result != undefined && result.length > 0) {
										entrance = result[Math.floor(Math.random() * result.length)].entrance;
									}
									match.socket.emit('alert', {//inform the current users of the room that the user has entered
										"alert": "entered",
										'user': user.username,
										"entrance": entrance
									});
								};

							});
						}
					}
				} else {//the user is banned from this room or does not have the required permissons
					socket.emit('alert', {
						'alert': 'danger',
						'text': 'You are not allowed in this room!'
					});
				}
			});

}

});

socket.on('chat', function(message) {
	//the user is allowed to chat and has a valid message
	if (user !== undefined && user.permissions && user.permissions.chat && user.room != undefined && user.username != undefined && message.chat != undefined && message.chat.replace(/^\s+/, '').replace(/\s+$/, '') !== '') {
		var chat = '';
		//if the user does not need their chat to be sanitiesed 
		if(user.permissions.aboveSanitize || user.permissions.god)
			chat = message.chat;
		else
			chat = sanitize(message.chat,user);
		chat = handleChatLinks(chat);

		var response = {
			"chat": chat,
			'user': user.username,
			'user_id': user.id
		};
		response.kickable = !user.permissions.unkickable;//if the user can be kicked from the room
		var group = getGroupById(user.group_id);
		//build the user's color data
		if (user.attributes != undefined && user.attributes != '' && JSON.parse(user.attributes).color != undefined) {
			response.color = JSON.parse(user.attributes).color;
		} else if (group != undefined && group.attributes != undefined && group.attributes != '' && JSON.parse(group.attributes).color != undefined) {
			response.color = JSON.parse(group.attributes).color;
		}
		response.rank = group.name;
		response.time = new Date();
		chatToRoom(user, response);//send message to the room
	}
});
socket.on('random', function(message) { // get a random word or funny
	var db = 'words';
	var field = 'word';
	if (message.type == 'funny') {
		db = 'funny';
		field = 'text';
	}
	var count = message.count || 1;
	if (user && user.permissions && user.permissions.words) {
		//get the number of rows in the appropreate db
		connectionRead.query("SELECT COUNT(*) FROM " + db, function(err, result) {
			var indexes = [];
			for (var i = 0; i < count; i++) { // get the proper number of random indicies 
				indexes.push(' id=' + (Math.floor(Math.random() * result[0]['COUNT(*)'] + 1)));

			}
			//select the indices 
			connectionRead.query('SELECT ' + field + ' FROM ' + db + ' WHERE ' + indexes.join(' or '), function(error, results) {
				var words = [];
				for (var j = 0; j < results.length; j++) {
					words.push(results[j][field].trim());
				}
				chatToRoom(user, {
					chat: words.join(', '),
					user: 'SERVER',
					'user_id': -1,
					kickable: false,
					time: new Date()
				});
			});
		});
	}
});
socket.on('sat', function(message) {//request for SAT data
	if (user && user.permissions && user.permissions.chat) {//if the user has permission for the data
		if (message.type == 'word') {
			connectionRead.query("SELECT COUNT(*) FROM sat_words", function(err, result) {//get the number of rows in the db
				var indexes = [];
				//select random and insert into array
				indexes.push(' id=' + (Math.floor(Math.random() * result[0]['COUNT(*)'] + 1)));
				connectionRead.query('SELECT word FROM sat_words WHERE ' + indexes.join(' or '), function(error, results) {//select rows
					var words = [];
					for (var j = 0; j < results.length; j++) {
						words.push(results[j].word);
					}
					chatToRoom(user, {//send response to room
						chat: words.join(',').replace(/\w,/g, ", "),
						user: 'SERVER',
						'user_id': -1,
						kickable: false,
						time: new Date()
					});
				});
			});
		} else if (message.type == 'define') {
			var word = message.word;
			connectionRead.query('SELECT definition,part_of_speech FROM sat_words WHERE word ="' + word + '"', function(err, result) {
				response = "Word not yet defined. Check your spelling or request that is it added";
				if (result && result.length > 0) {//if there is a word with that definition, build the definition
					response = word + " " + result[0].part_of_speech + " - " + result[0].definition;
				}
				chatToRoom(user, {//send repsonse to room
					chat: response,
					user: 'SERVER',
					'user_id': -1,
					kickable: false,
					time: new Date()
				});
			});
		} else if (message.type == 'sentence') {//no sentences are currently added
			var response = 'A sentence for this word does not yet exist.';
			chatToRoom(user, {
				chat: response,
				user: 'SERVER',
				'user_id': -1,
				kickable: false,
				time: new Date()
			});
		} else if (message.type == 'question') {//request a SAT question
			var numberOfAnswers = 4;
			connectionRead.query("SELECT COUNT(*) FROM sat_questions", function(err, result) {//get number of rows in table
				var indexes = [];
				indexes.push(' id=' + (Math.floor(Math.random() * result[0]['COUNT(*)'] + 1)));//randomly select one row
				connectionRead.query('SELECT question,answer,number_of_answers FROM sat_questions WHERE ' + indexes.join(' or '), function(error, results) {//get random row from table
					var answers = [];
					answers.push(results[0].answer);
					connectionRead.query("SELECT COUNT(*) FROM sat_words", function(err, result1) {//get number of rows in the table
						var indexes = [];
						for (var i = 0; i < numberOfAnswers * results[0].number_of_answers; i++) {//choose random word ids to add to the possible answers
							indexes.push(' id=' + (Math.floor(Math.random() * result1[0]['COUNT(*)'] + 1)));

						}
						connectionRead.query('SELECT word FROM sat_words WHERE ' + indexes.join(' or '), function(error, results1) {//select random words

							for (var j = 0; j < results1.length; j += results[0].number_of_answers) {
								var choices = results1.slice(j, j + results[0].number_of_answers);
								var words = [];
								for (var k = 0; k < choices.length; k++) {
									words.push(choices[k].word);
								}
								answers.push(words.join(','));
							}


								var shuffled = shuffle(answers);//shuffle answers
								var alphabet = ['a','b','c','d','e','f','g'];
								for(var q=0;q<shuffled.length;q++){
									shuffled[q]=alphabet[q]+") "+shuffled[q];
}
var formattedAnswers = shuffled.join('<br>');

chatToRoom(user, {//send response
	chat:results[0].question+"<br>"+formattedAnswers,//build question
	correctAnswer:results[0].answer,
	user: 'SERVER',
	'user_id': -1,
	kickable: false,
	time: new Date()
});
});
});
});
});
} else if (message.type == 'help') {//respond to SAT help
	var response = '</br>!satWord will return a random SAT word to the room</br>!satDefine {word} will return a definition for the word provdied as {word}</br>!satDefine {word} will return a sentence with the {word} used in it</br>!satHelp will return help for !sat commands</br>!satQuestion or !satQ will return a SAT Question</br>!answer or !satA {answer|answer choice} will check your answer for the most recent question';
	chatToRoom(user, {
		chat: response,
		user: 'SERVER',
		'user_id': -1,
		kickable: false,
		time: new Date()
	});
}
}
});

    socket.on('question',function(message){//respond to general question
        connection.query('SELECT id FROM classes WHERE class = \''+message.class+'\';',function(err1,result1){//get class id
            if(err1)
                console.error(err1);
            if(result1 && result1[0]){//if class exists
                var class_id = result1[0].id;
                connection.query('SELECT id FROM questions WHERE class_id = '+class_id,function(err2,result2){//get question ids
                    if(err1)
                        console.error(err2);
                   if(result2 && result2.length>0){
                        var q_id = result2[Math.floor(Math.random()*result2.length)].id;//get random question id
                        connection.query('SELECT question,answers,correct_answer FROM questions WHERE id = '+q_id,function(err3,result3){//get question
                            if(err3)
                                console.error(err3);
                            var answers = JSON.parse(result3[0].answers);//parse answers from JSON array
                            answers.push(result3[0].correct_answer);//add correct answer
                            var shuffled = shuffle(answers);//shuffle answers
                            var alphabet = ['a','b','c','d','e','f','g'];
								for(var q=0;q<shuffled.length;q++) {//assign letters to answer choices
                                    shuffled[q] = alphabet[q] + ") " + shuffled[q];
                                }
                            var formattedAnswers = shuffled.join('<br>');
                            chatToRoom(user, {//respond
                                chat:result3[0].question+"<br>"+formattedAnswers,//build question
                                correctAnswer:result3[0].correct_answer,
                                user: 'SERVER',
                                'user_id': -1,
                                kickable: false,
                                time: new Date()
                            });
                        });
                    }
                });
            }
        });
    });
socket.on('spanish',function(message){//request spanish conjugation question
	var forms = ['yo','tú','el','nosotros','ellos'];//list of different forms
	var form = forms[Math.floor(Math.random()*forms.length)];//select random form
	connectionRead.query('SELECT COUNT(*) FROM spanish_verbs',function(err,result){
		var id = Math.floor(Math.random() * result[0]['COUNT(*)'] + 1);//select random word id
		connectionRead.query('SELECT '+form+',tense,infinitive FROM spanish_verbs WHERE id='+id,function(error,results){//select form of random word
			chatToRoom(user,{//send to room
				chat:"Conjugate "+results[0].infinitive+" in the "+form+" "+results[0].tense+" tense",
				user:'SERVER',
				"user_id":-1,
				kickable:false,
				time:new Date(),
				correctAnswer:results[0][form]
			});
		});
	});
});

var emitSelf = function(emitSocket) {//inform the client of the state of the user
	var result = {};
	if (user == undefined || user === {} || user.hash==undefined) {//the user is not logged in
		result = {
			"status": "Not logged in"
		};
		emitSocket.emit('me', result);
	} else {// the user is logged in
		result = {
			"status": "Logged in",
			"username": user.username,
			"privates":{}
		};
		result.permissions = user.permissions;
		result.hash = user.hash;
		connection.query('INSERT INTO user_hash SET ?', {//insert the hash into the db
			user_id: user.id,
			hash: user.hash
		}, function(err, result) {});
		
		connection.query("SELECT * FROM private WHERE to_id = " + user.id + ' and receive_delete=0 order by id desc', function(err, results) {//get recived messages
			if(err)
				console.error(err);
			result.privates.receive = results;
			result.unread = 0;
            if(results) {
                for (var i = 0; i < results.length; i++) {//count unread messages
                    var message = results[i];
                    if (message.read == 0) {
                        result.unread++;
                    }
                }
            }
                connection.query("SELECT * FROM private WHERE from_id = " + user.id + ' and send_delete=0 order by id desc',function(err1,result1) {//get sent messages
                    if(result1){
                    result.privates.sent = result1;
                    var ids = [];
                    for (var i = 0; i < result.privates.receive.length; i++) {
                        ids.push(result.privates.receive[i].from_id);
                    }
                    for (var i = 0; i < result.privates.sent.length; i++) {
                        ids.push(result.privates.sent[i].to_id);
                    }
                    ids = ids.reduce(function (p, c) {//remove duplicate ids from the array
                        if (p.indexOf(c) < 0) p.push(c);
                        return p;
                    }, []);
                    connection.query('SELECT id,username FROM users WHERE id = ' + ids.join(' or '), function (err2, results2) {
                        function getUsername(id) {
                            for (var i = results2.length - 1; i >= 0; i--) {
                                if (results2[i].id == id)
                                    return results2[i].username;
                            }
                            ;
                            return '';
                        };
                        for (var i = 0; i < result.privates.receive.length; i++) {//associate usernames with ids
                            var message = result.privates.receive[i];
                            message.username = getUsername(message.from_id);
                        }
                        for (var i = 0; i < result.privates.sent.length; i++) {//associate usernames with ids
                            var message = result.privates.sent[i];
                            message.username = getUsername(message.to_id);

                        }
                        emitSocket.emit('me', result);//send to client
                    });

                }else{
                         emitSocket.emit('me', result);//send to client
                    }
                });

            });
}


};

socket.on('readMessages', function(message) {//update which messages the user has read
	if (user)
		connection.query('UPDATE private SET ? WHERE to_id = ' + user.id, {
			read: 1
		}, function(err, nothing) {
			emitSelf(socket);
		});
});
socket.on('deletePrivate', function(message) {//delete messages 
	if (user) {
		if(message.receiver)
		{
			connection.query('UPDATE  private SET receive_delete=1 WHERE `id` = ' + message.id, function (err, nothing) {
				emitSelf(socket);
			});
		}
		else{
			connection.query('UPDATE private SET send_delete=1 WHERE  `id` = ' + message.id, function (err, nothing) {
				emitSelf(socket);
			});
		}
	}
});

socket.on('me', function(message) {//client call for self
	emitSelf(socket);//emit the user to the client

});

socket.on('addRoom', function(message) {//cilent call to create a new room
	if (user != undefined && user.permissions.create) {//if the user has permission
		addRoom(message, updateRooms(function() {//add room
			emitRooms();
		}));
	}
});

socket.on('deleteRoom', function(message) {//client call to delete room
	var room = getRoomById(message.id);
	if (user != undefined && room != undefined && user.permissions != undefined && user.permissions.delete && (room.requirements.isDeleteable == undefined || room.requirements.isDeleteable || user.permissions.god)) {//if the user has permissions to delete rooms and the room is deletable or the user has permissions to override whether or not the room id deletable
		var usersInRoom = getUsersByRoom(room);
		for (var i = usersInRoom.length - 1; i >= 0; i--) {//alert the users in that room that the rooms has been deleted
			usersInRoom[i].socket.emit('alert', {
				"alert": "danger",
				"text": "The Room has been deleted"
			});
			usersInRoom[i].room = undefined;//set the room of the user as undefined 
		};
		deleteRoom(message, updateRooms(function() {//delete the room
			emitRooms();
		}));
	}
});

socket.on('leave room', function() {//call from client to have the user leave the room
	if (user !== undefined && user.username != undefined && user.room != undefined && user.room.id >= 0) {//if the user is in a rooom and in a room that is not independent
		var matching = getUsersByRoom(user.room);//get the other users in that room
		for (var i = matching.length - 1; i >= 0; i--) {//for each user
			var match = matching[i];//the user
			match.socket.emit('alert', {//inform the client that the user has left the room
				"alert": "left",
				'user': user.username
			});
		};
		user.room = undefined;//set the user's room as undefined
		emitRooms();
	} else if (user !== undefined) {
		user.room = undefined;
		emitRooms();
	}
});
socket.on('startTyping', function() {//call from client that the user has started typing
	if (user != undefined && user.username != undefined && user.room != undefined && user.room.id >= 0) {//if the user is in a rooom and in a room that is not independent
		var matching = getUsersByRoom(user.room);//get the other users in the room
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			if (match.socket != undefined)
				match.socket.emit('startTyping', {//inform the clients that the user has started typing
					'username': user.username
				});
		}
	}
});
socket.on('stopTyping', function(message) {//call from client that the user has stopped typing
	if (user != undefined && user.username != undefined && user.room != undefined && user.room.id >= 0) {//if the user is in a rooom and in a room that is not independent
		var matching = getUsersByRoom(user.room);//get the other users in the room
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			if (match.socket != undefined)
				match.socket.emit('stopTyping', {//inform the clients that the user has started typing
					'username': user.username
				});
		};
	}
});

socket.on('sendFile', function(message) {//call from client to send a file
	if (user !== undefined && user.room != undefined && user.username != undefined) {//if the user is valid

		var matching = getUsersByRoom(user.room);//get the other users in the room
			var response = {//build response
				"file": message,
				'user': user.username,
			    'user_id': user.id
			};
            response.kickable = !user.permissions.unkickable;
            //build color data
			var group = getGroupById(user.group_id);
			if (user.attributes != undefined && user.attributes != '' && JSON.parse(user.attributes).color != undefined) {
				response.color = JSON.parse(user.attributes).color;
			} else if (group != undefined && group.attributes != undefined && group.attributes != '' && JSON.parse(group.attributes).color != undefined) {
				response.color = JSON.parse(group.attributes).color;
			}
            response.rank = group.name;
		    response.time = new Date();
			for (var i = matching.length - 1; i >= 0; i--) {
				var match = matching[i];
				match.socket.emit('file', response);//send file to users
			};
		}
	});

socket.on('report', function(message) {//call from client to make a report
	if (user != undefined && user.id != undefined) {//if the user is valid
		message.user_id = user.id;
		if (message.email != undefined && message.email.replace(/^\s+/, '').replace(/\s+$/, '') !== '')//if the email is not valid
			message.email = user.email;
	}
	connection.query('INSERT INTO reports SET ?', message, function(err, result) {//insert the report into the db
		if (err != undefined && err != null)
			console.error(err);
		sendEmails();//send the emails
	});
});

socket.on('kick', function(message) {//call from client to kick a user from the room
	if (user != undefined && user.permissions != undefined && user.permissions.kick) {//if the kicking user is valid and the user has permissions
		var bannedUser = getUserById(message.user_id);
		if(!bannedUser.permissions.unkickable|| user.permissions.god)//if the kicked user can be kicked or the kicking user can override
		{
			ban(message.user_id, user.room.id,message.duration);//ban the user
			
			if (bannedUser != undefined && bannedUser.socket != undefined) {//if the kicked user is valid
				bannedUser.socket.emit('alert', {//inform the user that they have been banned
					'alert': 'danger',
					'text': 'You have been banned from this room for '+(message.duration/(60*1000))+' minutes'
				});
				bannedUser.room = undefined;//remove the user from the room
			}
		}
		else if(bannedUser.id == user.id){//if a user tries to ban them self
			user.socket.emit('alert',{'alert':'info',"text":"Did you really just try to ban yourself. What is wrong with you?"})//question their descision
		}
		else{//they user could not be banned
			bannedUser.socket.emit('alert',{'alert':"info",'text':user.username+" tried to ban you, just though you would want to know."});//let the kicked user konw
			user.socket.emit('alert',{'alert':"info",'text':'You can\'t ban '+bannedUser.username+", you silly"});//let the kicking user know
		}

	}
});

socket.on('restart', function(message) {//call from the client to restart the server
	if (user != undefined && user.permissions != undefined && user.permissions.restart) {//if the user is valid and has permissions to restart the server
		io.emit('alert', {//let all clients know that the server is restarting
			'alert': 'info',
			"text": "The server is restarting. Please refresh your page."
		});
		setTimeout(function() {//wait 100ms before closing the process. Forever will restart the proccess
			process.exit()
		}, 100);
	}
})

socket.on('private', function(message) {//call from the client to send a private message
	if (user != undefined && user.permissions.chat) {//if the user is valid and has permissions
		if (message.message && message.to_username) {//if the message and reciving username exist
			getUser(message.to_username, function(to) {//get the revicing user
				if (to) {//if that user exists
					var insertVars = {//build data
						to_id: to.id,
						from_id: user.id,
						"message": message.message,
						time: new Date(),
						from_username: user.username
					};
					connection.query('INSERT INTO private SET ?', insertVars, function(err, result) {//insert data
						if (err) {
							console.error(err);
						}
					});
					var onlineTo = getUserById(to.id);
					if (onlineTo) {//if the user is online
						emitSelf(onlineTo.socket);
						onlineTo.socket.emit('alert', {//let the user know that they have a new private message
							'alert': 'new message',
							'message': message.message,
							'from': user.username
						});
					}
				}
			})
		}
	}
})

socket.on('change_rank', function(message){//client call to change the rank of a user
    if(user != undefined && user.permissions && user.permissions.Admin){//if the user is valid and has adminsitrator permissions
        var other_user = getUserById(message.user_id);//get the online user that is having their rank being changed
        if(other_user){//if the other user exists
            var prev_rank = other_user.permissions.rank;
            if(user.permissions.god){//override
                connection.query("UPDATE users SET group_id = "+message.group+" WHERE id = "+message.user_id,function(err,res){//update the user in the database
                  if(err)
                    console.error(err);
                      connection.query('SELECT name,permissions from groups where id ='+message.group,function(error,result){//update the online user's permissions
                           if(result && result[0]) {//if the group is valid
                               var group = result[0];
                               group.permissions = JSON.parse(group.permissions);
                               other_user.permissions = group.permissions;
                               other_user.group_id=message.group;
                               if(group.permissions.rank>prev_rank){//let the user know that they have been promoted
                                   other_user.socket.emit('alert',{alert:'success',text:"You have been promoted to "+result[0].name});
                               }
                               else{//let the user know that they have been demoted
                                   other_user.socket.emit('alert',{alert:'danger',text:"You have been demoted to "+result[0].name});
                               }
                           }
                      });
                });
            }
            else if(user.permissions.rank>other_user.permissions.rank){//if the user changing permissions is of a higher rank than the user who is having their permissions being changed
                connection.query('SELECT name,permissions from groups where id ='+message.group,function(error,result){//get the new group information
                    if(error)
                        console.error(error);
                   if(result && result[0]){//if the group exists
                       var group = result[0];
                       group.permissions = JSON.parse(group.permissions);
                       if(group.permissions.rank<user.permissions.rank){//if the group rank is lower than the rank of the person who is changing the rank
                           connection.query("UPDATE users SET group_id = "+message.group+" WHERE id = "+message.user_id,function(err,res){//update the user in the database
                              if(err)
                                console.error(err);
                            	//update the online user
                               other_user.permissions = group.permissions;
                               other_user.group_id=message.group;
                               if(group.permissions.rank>prev_rank){//inform the user that they have been promoted
                                   other_user.socket.emit('alert',{alert:'success',text:"You have been promoted to "+result[0].name});
                               }
                               else{//inform the user that they have been demoted
                                   other_user.socket.emit('alert',{alert:'danger',text:"You have been demoted to "+result[0].name});
                               }
                           });
                       }
                       else
                        user.socket.emit("alert",{alert:"danger",text:"You are stepping out of bounds"});//if the user changing the permissions does not have the right to do so; let them know
                   } 
                });
            }
            else{
                user.socket.emit("alert",{alert:"danger",text:"You are stepping out of bounds"});//if the user changing the permissiosn does not have the right to do so; let them know
            }
        }
    }
});

socket.on('points',function(message){//client call to add points
   if(user.permissions.points_master){//if the user has permissions to change points
       var insertObj = {user_id:message.user_id,amount:message.amount};//the update object
       connection.query('Insert into awarded_points SET ?',insertObj,function(err,res){//insert the points into the table
           var other_user = getUserById(message.user_id);
           if(other_user){//if the user is online
               other_user.socket.emit('alert',{alert:"success",text:"You have been awarded "+message.amount+" Points"})//let them know
           }
           if(err)
               console.error(err);
        
       })
   } 
});


var emitRooms = function() {//emit the list of rooms to all clients
	//get the latest room data
	updateRooms(function() {
		var tempRooms = [];
		for (var i = rooms.length - 1; i >= 0; i--) {//foreach room
			var room = rooms[i];
			var roomUsers = getUsersByRoom(room);//get the users in the room
			room.guestCount = 0;
			room.userCount = 0;
			room.users = [];
			for (var j = roomUsers.length - 1; j >= 0; j--) {//foreach user in the room
				var user = roomUsers[j];
				if (user != undefined) {
					if (user.username != undefined) {//if the user is logged in then add them to the user list and increase the user count
						room.users.push(user.username);
						room.userCount++;
					} else {//if they are not logged in add them to the guest count
						room.guestCount++;
					}
				}
			};
				//clone the room so that only the nesseary data will be passed to the client
			var tempRoom = {};
            tempRoom.guestCount = room.guestCount;
            tempRoom.id = room.id;
            tempRoom.name = room.name;
            tempRoom.requirements = room.requirements;
            tempRoom.userCount = room.userCount;
            tempRoom.users = room.users;

			if (tempRoom.requirements != undefined && tempRoom.requirements.password != undefined)
				delete tempRoom.requirements.password;//remote the password data from the information passed to the client
            delete tempRoom.bots;//remove the bot data from the information passed to the client
			tempRooms.push(tempRoom);

			};
			io.emit('rooms', {//send the rooms to all the users
				"rooms": tempRooms
			});
		});
};

emitRooms();//emit the rooms on startup
setInterval(emitRooms, 60000);//emit the rooms every 60 seconds


});


app.post('/reguser', function(req, res) {//register user post directory
	isValidUser(req.body, function(errors) {
		if (errors.length == 0) {//if the registration is valid
			insertUser(req.body);//insert the user into the database
			var result = {};
			result.status = 'OK';
			result.redirect = '/chat.html';//reirect the user to the chat page
			req.session.username = req.body.username;
			res.json(result);
		} else {
			var result = {};
			result.status = 'errors';
			result.errors = errors;
			console.log(errors);
			res.json(result);//let the client know what the errors were
		}
	});

});

app.post('/rooms',function(req,res){
	var secret=config.secret;
	https.get("https://www.google.com/recaptcha/api/siteverify?secret=" + secret + "&response=" + req.body['g-recaptcha-response']+"&remoteip="+req.ip, function(response) {
                var str = '';
		response.on('data', function (chunk) {
		    str += chunk;
		  });

		  response.on('end', function () {
		  	console.log(str);
		    var res2 = JSON.parse(str);
		    console.log(res2);
		    if (res2.success) {
		    	fs.readFile(config.dir+"/chat.html",function(err,data){
		    		if(err) console.error(err);
		    		else{
		    			res.send(data.toString('utf8'));
		    		}
		    	});
		    }
		    else{
		    	res.send("<h1>LOOKS LIKE YOU ARE NOT A HUMAN!</h1><br><a href='"+config.domain+">Go back to landing page</a>");
		    }
		  });
        })
});

app.post('/me', function(req, res) {//post directory for loginstatus
	if (req.session.username == undefined)
		res.json({
			"status": "Not logged in"
		});
	else
		res.json({
			"status": "Logged in"
		});
});

app.post('/login', function(req, res) {//login through post directory
	var body = req.body;
	getUserFromHash(body.hash,function(callbackUser){
		if(!callbackUser){
			login(body.username, body.password, function(sucessful) {
				if (sucessful) {
					req.session.username = body.username;
					res.json({
						"status": "OK"
					});
				} else {
					res.json({
						"status": "failure"
					})
				}
			});
		}else{
			req.session.username = callbackUser.username;
			res.json({
				"status": "OK"
			});
		}
	})
	
});

app.post('/archive', function(req, res) {//archive data post direcotry
	var body = JSON.parse(req.body.blarg);
	body.order = body.order || {};// either sent order or new object
	body.order.by = body.order.by || 'id';//either order by what was sent or id
	body.order.direction = body.order.direction || 'ASC';//either order by what was sent to or by Ascending
	if (req.session.username) {//if the user is logged in through the session
		getUser(req.session.username, function(user) {//get the user
			if (user && user.permissions && user.permissions.archive) {//if they have permission to use the archive
				try {
					if (body.type == 'chat') {//if the archive requested is chat
						//build sql statement
						var sql = 'SELECT user_id,room_id,message,time FROM chat ';
						if (body.where.field) {
							sql += 'WHERE ' + body.where.field + ' ' + body.where.equals + ' ';
						}
						sql += 'ORDER BY ' + body.order.by + ' ' + body.order.direction + ' ';
						if (body.range.length != 0) {
							sql += ' LIMIT ' + body.range.start + ',' + body.range.length + ' ';
						}
						connection.query(sql, function(err1, results) {
							if (!results) {//if there were no results let the user know
								res.json({
									'success': false,
									'message': 'SQL ERROR/NO RESULTS'
								})
							} else {
								connection.query('SELECT id,username FROM users', function(err2, users) {//get the usernames and id to insert the usernames in to the table
									if (err1 || err2) {
										res.json({
											'success': false,
											'message': 'SQL ERROR'
										})
									} else {
										var getUser = function(id) {

											for (var j = users.length - 1; j >= 0; j--) {
												if (users[j].id == id)
													return users[j];
											};
										}
										for (var i = results.length - 1; i >= 0; i--) {
											var result = results[i];
											var user = getUser(result.user_id);
											var room = getRoomById(result.room_id);
											result.username = user.username || '*REMOVED*';
											result['room_name*'] = room ? room.name : '*DELETED*';
										};
										res.json({
											success: true,
											info: results
										});
									}
								});
							}
						});

} else if (body.type == 'users') {//if the user wanted user data
	//build sql statement
	var sql = 'SELECT id,username,first_name,last_name,email,group_id FROM users ';
	if (body.where.field) {
		sql += 'WHERE ' + body.where.field + '  =  "' + body.where.equals + '" ';
	}
	sql += 'ORDER BY ' + body.order.by + ' ' + body.order.direction + ' ';
	if (body.range.length != 0) {
		sql += ' LIMIT ' + body.range.start + ',' + body.range.length + ' ';
	}
	connection.query(sql, function(err1, results) {//if there was a problem let the user knjow
		if (!results) {
			res.json({
				'success': false,
				'message': 'SQL ERROR/NO RESULTS'
			})
		} else {
			connection.query('SELECT id,name FROM groups', function(err2, groups) {
				if (err1 || err2) {//if there was a problem let the user know
					res.json({
						'success': false,
						'message': 'SQL ERROR'
					})
				} else {
					var getGroup = function(id) {

						for (var j = groups.length - 1; j >= 0; j--) {
							if (groups[j].id == id)
								return groups[j];
						};
					}
					for (var i = results.length - 1; i >= 0; i--) {
						var result = results[i];
						var group = getGroup(result.group_id);
						result['group_name*'] = group ? group.name : '*DELETED*';
					};
					res.json({
						success: true,
						info: results
					});
				}
			});
		}
	});
}
} catch (error) {
	res.json({
		'success': false,
		'message': 'SQL ERROR'
	})
}
} else {
	res.json({
		'success': false,
		'message': 'INVALID PERMISSIONS'
	});
}
});
} else {
	res.json({
		'success': false,
		'message': 'LOGIN'
	});
}
});

app.get('/metrics.json',function(req,res){//get the latest metrics data
	connection.query('SELECT metrics,id FROM metrics ORDER BY time DESC LIMIT 1',function(err,result){
		res.send(200,result[0].metrics);
	});
});

app.get('/u/:id',function(req,res){//get a user page
	userData.getUserData(connection,req.params.id,function(data){
		res.render('user',data);
	});
});


app.get('/forgot/:id/:hash', function(req, res) {
	connection.query('SELECT id FROM forgot WHERE user_id = '+req.params.id+" AND hash = '"+req.params.hash+"'",function(err,result){
		if(err)
			console.error(err);
		if(result && result[0]){
			fs.readFile(config.dir+"/forgot.html",function(err1,data){
		    		if(err1) console.error(err1);
		    		else{
		    			res.send(data.toString('utf8'));
		    		}
		    	});
		}else{
			res.send("<h1>You have an Invalid hash</h1><br><a href='"+config.domain+">Go back to landing page</a>");
		}
	});
});

app.post('/reset-password',function(req,res){
	var body = req.body;
	connection.query('SELECT id FROM forgot WHERE user_id = '+body.id+" AND hash = '"+body.hash+"'",function(err,result){
		if(err)
			console.error(err);
		if(result && result[0]){
			connection.query('DELETE FROM fogot WHERE id = '+result.id,function(err1,result1){if(err1)console.error(err1);});
			var salt = crypto.randomBytes(128).toString('base64');//generate a random salt
			var password = hash(salt, body.password)//hash the password and salt
			connection.query("UPDATE USERS SET salt = '"+salt+"' password='"+password+"'",function(err1,result1){if(err1)console.error(err1);});
			res.json({
				success:true,
				errors:[]
			});
		}
		res.json({
				success:false,
				errors:["invalid hash"]
			});
	});
});

app.post('/forgot-request',function(req,res){
	var username = req.body.username;
	connection.query("SELECT id,first_name,username,email FROM users WHERE username = '"+ username +"'",function(err,result){
		if(result && result[0]){
			var hash = crypto.randomBytes(50).toString('base64').replace(new RegExp('/','g'), '');
			var message = 'subject: NOREPLY\r\n\r\n';
			message+= 'Hi '+result[0].first_name+ "("+result[0].username+"),\n";
			message+="It would appear that you have forggoten your password. Please click this link to reset it "+config.domain+"/forgot/"+result[0].id+"/"+hash+"\n\n\n";
			mail('gsmstchat@gmail.com', result[0].email, message);

			connection.query('INSERT into forgot SET ?',{user_id:result[0].id,hash:hash},function(err,result1){if(err)console.error(err);});
		}else{
			res.json({
				success:false,
				errors:["invalid username"]
			});
		}
	});
});



var isValidUser = function(data, callback) {//validate user
	var errors = [];
	var dataKeys = Object.keys(data);
	var j = dataKeys.length - 1;

	var currentValidation = 0;


	var validate = function(rule, ruleVal, dataKey, value, next) {//validate one field
		if (rule == 'min') {
			if (value.length < ruleVal)
				errors.push({//if there was a problem, add it to the array
					'rule': rule,
					'ruleVal': ruleVal,
					"element": dataKey,
					"text": dataKey + " must be " + ruleVal + " or more characters"
				});
			setTimeout(function() {
				next(errors);
			}, 1);
		} else if (rule == 'max') {
			if (value.length >= ruleVal)
				errors.push({//if there was a problem, add it to the array
					'rule': rule,
					'ruleVal': ruleVal,
					"element": dataKey,
					"text": dataKey + " must be less than " + ruleVal + " characters"
				});
			setTimeout(function() {
				next(errors);
			}, 1);
		} else if (rule == 'unique') {
			connection.query("SELECT `id` from " + ruleVal.table + " where " + ruleVal.column + " = '" + value + "'", function(err, result) {
				console.log(err);
				if (result !== undefined && result.length > 1)
					errors.push({//if there was a problem, add it to the array
						"element": dataKey,
						"text": "Your " + dataKey + " must be unique"
					});
				setTimeout(function() {
					next(errors);
				}, 1);
			});
		} else if (rule == 'matches') {
			if (value !== data[ruleVal])
				errors.push({//if there was a problem, add it to the array
					'rule': rule,
					'ruleVal': ruleVal,
					"element": dataKey,
					"text": dataKey + " must be match " + ruleVal + "."
				});
			next(errors);
		} else
		next(errors);
	};
	var runNextValidation = function(errors) {//callaback to run the next validation
		var dataKey = dataKeys[j];
		var value = data[dataKey];

		var rules = Object.keys(config.register_validataions[dataKey]);
		var rule = rules[currentValidation];

		var ruleVal = config.register_validataions[dataKey][rule];
		currentValidation++;

		if (j == 0 && currentValidation == rules.length)
			validate(rule, ruleVal, dataKey, value, callback);
		else {
			if (currentValidation >= rules.length) {
				j--;
				currentValidation = 0;
			}
			validate(rule, ruleVal, dataKey, value, runNextValidation);

		}
	};
	var rules = Object.keys(config.register_validataions);
	for (var i = rules.length - 1; i >= 0; i--) {
		var ruleKey = rules[i];
		var datavalue = data[ruleKey];
		if (config.register_validataions[ruleKey].required == true && (datavalue === undefined || datavalue.trim() === '')) {
			errors.push({//if there was a problem, add it to the array
				"element": ruleKey,
				"rule": "required",
				"text": ruleKey + " is required"
			});
			delete data[ruleKey];
		}
	};
	dataKeys = Object.keys(data);
	if (dataKeys !== undefined && dataKeys.length > 0)
		runNextValidation(null);
	else
		callback(errors);


};

var insertUser = function(userData) {//insert the user into the database
	var user = {};
	user.username = userData.username;
	user.first_name = userData.firstname;
	user.last_name = userData.lastname;
	user.email = userData.email;
	user.group_id = 1;
	var salt = crypto.randomBytes(128).toString('base64');//generate a random salt
	user.password = hash(salt, userData.password)//hash the password and salt
	user.salt = salt;
	var query = connection.query('INSERT INTO users SET ?', user, function(err, result) {//insert user
		console.log(err);
		login(userData.username, userData.password, undefined);//log them in
		sendEmails();//send them an email
	});


};

var addRoom = function(data, callback) {//function to add a room
	//build requirements
	var requirements = {};
	requirements.hasPassword = data.hasPassword;
	if (data.hasPassword)
		requirements.password = data.password;
	requirements.isDeleteable = data.isDeleteable;
	if (data.rank !== 'Guest')//if the rank requirement is guest make no requirement for rank
		requirements.rank = data.rank;
	var query = connection.query('INSERT INTO rooms SET ?', {//insert into db
		"name": data.name,
		'requirements': JSON.stringify(requirements),
		'bots':[]
	}, function(err, result) {
		if (err !== null)
			console.error("At Add room: %s", err);
		if (callback !== null && callback !== undefined)
			callback();
	});
};

var deleteRoom = function(data, callback) {//function to delete a room
	connection.query('DELETE FROM rooms WHERE id = ' + data.id, function(err, result) {
		if (err !== null)
			console.error("At delete room: %s", err);
		else
			console.log(result)
		if (callback !== null && callback !== undefined)
			callback();
	});
}

var updateRooms = function(callback) {//get the rooms from the db
	var query = connection.query("SELECT * FROM rooms", function(err, result) {
		if (err !== null)
			console.error("At Update room: %s", err);
		rooms = [];
		for (var i = result.length - 1; i >= 0; i--) {//foreach room
			result[i].requirements = JSON.parse(result[i].requirements);
            result[i].bots = JSON.parse(result[i].bots);
            if(result[i].bots)
                connect_bots(result[i]);//connect the bots
			rooms.push(result[i]);
		}
		if (callback !== null && callback !== undefined)
			callback();

	});
};
updateRooms();



var connect_bots=function(room){//function to connect the bots
    for(var i =0;i<room.bots.length;i++){//foreach bot
        var bot = room.bots[i];



        bot.send = function(data){//create send function
        	if(data.length>1000){
        		data.slice(0,1000);
        	}
            data = new Buffer(JSON.stringify(data));//put the data in a buffer
           botsend.send(data,0,data.length,this.port,this.host,function(err,bytes){//send the data to the bot
                if (err) {
                    console.error(err);
                }
            });
        }

    }
}

var getUser = function(username, callback) {//get user by username
	var query = connection.query('SELECT * from users where username = "' + username + '"', function(err, result) {
		if(result && result[0]){//if the user exists
		var user = result[0];
		connection.query('SELECT * from groups where id = ' + user.group_id, function(err, res) {//get the user's permissions
			if (err != null)
				console.error("At get User group : " + err);
			user.permissions = JSON.parse(res[0].permissions);
			callback(user);
		});
	}

	});
};

var hash = function(salt, raw) {

	return crypto.pbkdf2Sync(raw, salt, config.hash.itterations, config.hash.length).toString('base64');
};

var login = function(username, password, callback) {//login function, returns boolean of login success
	if (password != '' && password != undefined) {
		var query = connection.query('SELECT `username`,`password`,`salt` from users where username = "' + username + '"', function(err, result) {
			if (result.length > 0 && result[0].password === hash(result[0].salt, password)) {
				if (callback !== undefined)
					callback(true);
			} else {
				if (callback !== undefined)
					callback(false);
			}
		});
	} else {
		if (callback !== undefined)
			callback(false);
	}
};

var guid = function() {//guid generation function
	function s4() {
		return Math.floor((1 + Math.random()) * 0x10000)
		.toString(16)
		.substring(1);
	}
	return function() {
		return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
		s4() + '-' + s4() + s4() + s4();
	};
};

var getUserBySocket = function(socket) {//get online user by their socket
	for (var i = users.length - 1; i >= 0; i--) {
		var user = users[i];
		if (user.socket != undefined && user.socket.id == socket.id)
			return user;
	};
}
var getUserById = function(id) {//get online use by id
	for (var i = users.length - 1; i >= 0; i--) {
		var user = users[i];
		if (user.id != undefined && user.id == id)
			return user;
	};
}

var getRoomById = function(id) {//get room by id
	for (var i = rooms.length - 1; i >= 0; i--) {
		var room = rooms[i];
		if (room.id == id)
			return room;
	};
}

var getUsersByRoom = function(room) {//get all the online users in a room
	var matching = [];
	for (var i = users.length - 1; i >= 0; i--) {
		var user = users[i];
		if (user.room !== undefined && user.socket != undefined && room !== undefined && user.room.id == room.id)
			matching.push(user);
	};
	return matching;
}

var getWordList=function(){//generate the blacklist regex
	var pattern = [],replace=[];
	pattern.push('[Aa]'); replace.push('(a|A|@)');
	pattern.push('[CcKk]'); replace.push('(?:(c|C|\\(|k|K))');
		pattern.push('[Dd]'); replace.push('(d|D)');
		pattern.push('[Ee]'); replace.push('(e|E|3)');
		pattern.push('[Gg]'); replace.push('(g|G|6)');
		pattern.push('[Hh]'); replace.push('(h|H)');
		pattern.push('[IilL]'); replace.push('(i|I|l|L|!|1|\\|)');
		pattern.push('[Jj]'); replace.push('(j|J)');
		pattern.push('[Mm]'); replace.push('(m|M)');
		pattern.push('[Nn]'); replace.push('(n|N)');
		pattern.push('[Oo]'); replace.push('(o|O|0)');
		pattern.push('[Pp]'); replace.push('(p|P)');
		pattern.push('[Qq]'); replace.push('(q|Q|9)');
		pattern.push('[Rr]'); replace.push('(r|R)');
		pattern.push('[Ss]'); replace.push('(s|S|\\$|5)');
		pattern.push('[Tt]'); replace.push('(t|T|7)');
		pattern.push('[Uu]'); replace.push('(u|U|v|V)');
		pattern.push('[Vv]'); replace.push('(v|V|u|U)');
		pattern.push('[Xx]'); replace.push('(x|X)');
		pattern.push('[Yy]'); replace.push('(y|Y)');
		pattern.push('[Zz]'); replace.push('(z|Z|2)');
		pattern.push('[Ff]'); replace.push('(?:(f|F|ph|pH|Ph|PH))');
		pattern.push('[Bb]'); replace.push('(b|B|I3|l3|i3)');
		pattern.push('[Ww]'); replace.push('(w|W|vv|VV)');
		var wordCharNotMatch = '(?:[^a-zA-Z\\d]+)';
		var list = [];
		connection.query('SELECT word from bad_words',function(err,result){
			for(var i =0;i<result.length;i++){
				var word = result[i].word;
				for(var j=0;j<pattern.length;j++){
					word = word.replace(new RegExp(pattern[j],'g'),replace[j]);
				}
				list.push(new RegExp('(?:(^|[ ]))'+word+'(?![^ ])','g'));
			}
			blacklistRegex=list;

		});
	};

	getWordList();
	var handleChatLinks=function(chat){//function that returns the chat with links converted to clickable html
		var reg_exUrl = new RegExp(/(((http|https|ftp|ftps)\:\/\/|www\.)[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?)|(\d{1,3}\.){3}\d{1,3}(\/\S*)?/g);
		var matches = chat.match(reg_exUrl) || [];
		for (var i = matches.length - 1; i >= 0; i--) {
			var match = matches[i];
			var image_regex = new RegExp(/(png|jpg|jpeg|gif)$/g);
			if (match.match(image_regex))
				chat = chat.replace(match,"<a target='blank' href='"+match+"'><img src='" + match + "'></img></a>");
			else
				chat = chat.replace(match, "<a target='_blank' href='" + match + "'>" + match + "</a>");
		};
		return chat;
	}
	var sanitize = function(chat,user) {//santitize html from chat and blacklisted words
		chat = validator.escape(chat);
		for(var j =0;j<blacklistRegex.length;j++){
			var regex = blacklistRegex[j];
			var matches = chat.match(regex) || [];
			for (var i = matches.length - 1; i >= 0; i--) {
				var match = matches[i];
				chat = chat.replace(match, "<span class='text-danger'>&nbsp;[CENSORED]</span>");
				connection.query('UPDATE users SET infractions =infractions+1 WHERE id = '+user.id,function(err,result){if(err)console.error(err);});
			};
		}


		return chat;
	}

	var getGroups = function() {//returns the groups from the database
		connection.query('Select * from groups', function(err, result) {
			groups = result;
		});
	};
	getGroups();

	var getGroupById = function(id) {//get group by id
		for (var i = groups.length - 1; i >= 0; i--) {
			var group = groups[i];
			if (group.id == id)
				return group;
		};
	};
	var ban = function(user, room, duration) {//function to ban a user
		var insertVars = {
			user_id: user,
			room_id: room,
			duration: duration,
			time: new Date()
		};
		connection.query("INSERT INTO kicks SET ?", insertVars, function(err, result) {
			if (err != null)
				console.error(err);
		});
	}

	var isBanned = function(user, room, callback) {//function to check if a user is currently banned from a room
		if (user) {
			connection.query("SELECT id,time,duration FROM kicks WHERE user_id = " + user.id + " and room_id = " + room.id, function(err, results) {
				if (results == undefined || results == null || results.length == 0) {
					if (callback != undefined) {
						callback(false);
					}
				} else {
					var time = new Date(results[0].time);
					var duration = results[0].duration;
					if ((new Date()) - time >= duration) {

						if (callback != undefined) {
							callback(false);
						}
					} else {
						if (callback != undefined) {
							callback(true);
						}
					}
				}
			});
		} else {
			callback(false);
		}
	}

	setInterval(function() {
		for (var i = users.length - 1; i >= 0; i--) {
			user = users[i];
			if (user.socket == undefined) {
				users.splice(users.indexOf(user), 1)
			}
		};
		getGroups();
	}, 60000);



	function mail(from, to, message) {//send an email
		//build client
		var client = simplesmtp.connect(465, 'smtp.gmail.com', {
			secureConnection: true,
			auth: {
				user: config.mail.username,
				pass: config.mail.password
			},
			debug: false
		});

		client.once('idle', function() {
			client.useEnvelope({
				from: from,
				to: [].concat(to || [])
			});
		});

		client.on('message', function() {
			client.write(message.replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..'));
			client.end();
		});

		client.on('ready', function(success) {
			client.quit();
		});

		client.on('error', function(err) {
			console.log('ERROR');
			console.log(err);
		});

		client.on('end', function() {
			console.log('DONE')
		});
	}

	var sendEmails = function() {//send all emails
		connection.query('SELECT `id`,`name`,`email`,`type`,`report` FROM `reports` WHERE informed = 0', function(err, results) {//send emails from reports
			for (var i = results.length - 1; i >= 0; i--) {
				var result = results[i];
				var message = 'subject: NOREPLY\r\n\r\n';
				var admin_message = '';
				if (result.type == 'request') {
					message += 'Thank you ' + result.name + " for submitting request\n\n" + result.report + "\n\nWe will be looking into it shortly";
					admin_message = 'subject: NEW REQUEST\r\n\r\n';
					admin_message += result.name + ' submitted request "' + result.report + '"';
					connection.query('UPDATE `reports` SET ? WHERE id = ' + result.id, {
						informed: 1
					}, function(err, result) {
						if (err != undefined) console.error(err);
					});
				} else if (result.type == 'bug') {
					message += 'Thank you ' + result.name + " for submitting bug report\n\n" + result.report + "\n\nWe will be looking into it shortly. Your Ticket Id is " + result.id;
					admin_message = 'subject: NEW BUG\r\n\r\n';
					admin_message += result.name + ' submitted bug "' + result.report + '"';
					connection.query('UPDATE `reports` SET ? WHERE id = ' + result.id, {
						informed: 1
					}, function(err, result) {
						if (err != undefined) console.error(err);
					});
				}
				mail('gsmstchat@gmail.com', result.email, message);
				connection.query('SELECT `email` FROM `users` WHERE group_id=4 or group_id=5', function(error, admins) {
					for (var j = admins.length - 1; j >= 0; j--) {
						var admin = admins[j];
						mail('gsmstchat@gmail.com', admin.email, admin_message);
					};
				});
			};
		});
connection.query('SELECT `id`,`username`,`first_name`,`last_name`,`email` FROM `users` WHERE informed = 0', function(err, results) {//send emails for new accounts
	for (var i = results.length - 1; i >= 0; i--) {
		var result = results[i];
		var message = 'subject: NOREPLY\r\n\r\n';

		message += 'Thank you ' + result.first_name + ' ' + result.last_name + " for registering at GSMSTCHAT.com";
		connection.query('UPDATE `users` SET ? WHERE id = ' + result.id, {
			informed: 1
		}, function(err, result) {
			if (err != undefined) console.error(err);
		});

		mail('gsmstchat@gmail.com', result.email, message);
	};

});
};

var getUserFromHash = function(hash, callback) {//get the user with that hash
	connection.query("SELECT user_id FROM user_hash WHERE hash = '" + hash + "'", function(err, result) {
		if (result == undefined || result.length == 0) {
			callback();
		} else {
			connection.query("SELECT username FROM users WHERE id = " + result[0].user_id, function(err1, result1) {
				getUser(result1[0].username, callback);
			});
		}
	});
}

var chatToRoom = function(user, message) {//chat to a room
	connectionChat.query('INSERT INTO chat SET ?', {//insert the chat into the database
		'user_id':message.user_id,
		'message': message.chat,
		"room_id": user.room.id
	}, function(err, result) {
		if (err != null) console.log(err);
	});
    var room =user.room;
    message.room_id = room.id;
    for(var i=0;i<room.bots.length;i++){
        var bot = room.bots[i];
        bot.send(message);
    }

	if (user.room.id >= 0) {//if the room id is greater than 0 send it to all the users in the room
		var matching = getUsersByRoom(user.room);
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			match.socket.emit('chat', message);
		};
	} else {//this is a independent room and should only be sent to the user that orginally sent the chat
		user.socket.emit('chat', message);
	}
};

function shuffle(array) {
								var currentIndex = array.length,
								temporaryValue, randomIndex;

									// While there remain elements to shuffle...
									while (0 !== currentIndex) {

										// Pick a remaining element...
										randomIndex = Math.floor(Math.random() * currentIndex);
										currentIndex -= 1;

										// And swap it with the current element.
										temporaryValue = array[currentIndex];
										array[currentIndex] = array[randomIndex];
										array[randomIndex] = temporaryValue;
									}

									return array;
								}




sendEmails();