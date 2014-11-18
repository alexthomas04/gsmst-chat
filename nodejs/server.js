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
io.on('connection', function(socket) {
	var user;
	
	socket.emit('connected',{});
	socket.on('disconnect', function() {

		if (user !== undefined) {
			var sessionLength = (new Date())-user.sessionStart;
			connection.query('INSERT INTO sessions SET ?',{user_id:user.id,duration:sessionLength});
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
		getUserFromHash(message.hash, function(callbackUser) {
			if (callbackUser == undefined) {
				login(message.username, message.password, function(success) {
					if (success) {
						if (user !== undefined) {
							user.socket = undefined;
						}
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
			} else {
				if (user !== undefined) {
					user.socket = undefined;
				}
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
		var canEnterRoom = function(user, room, callback) {
			if (user != undefined && user.permissions != undefined && user.permissions.god)
				callback(true);
			else {
				isBanned(user, room, function(banned) {
					if (banned)
						callback(false);
					else {
						if (room.requirements) {
							if (room.requirements.rank) {

								if (!user || user.permissions == undefined || !(user.permissions[room.requirements.rank]))
									callback(false);

							}
							if (room.requirements.hasPassword && message.password != room.requirements.password) {
								callback(false);
							}
						}

						callback(true);
					}
				});
			}


		};


		var room = getRoomById(message.roomId);
		if (room != undefined) {
			canEnterRoom(user, room, function(canEnter) {
				if (canEnter) {
					if (user != undefined && user.room == undefined) {
						user.room = room;
						emitRooms();
						if (user.room != undefined && user.room.id >= 0) {
							connection.query('Select `entrance` from `entrances` where group_id=' + user.group_id, function(err, result) {
								var matching = getUsersByRoom(user.room);
								for (var i = matching.length - 1; i >= 0; i--) {
									var match = matching[i];
									var entrance;
									if (result != undefined && result.length > 0) {
										entrance = result[Math.floor(Math.random() * result.length)].entrance;
									}
									match.socket.emit('alert', {
										"alert": "entered",
										'user': user.username,
										"entrance": entrance
									});
								};

							});
						}
					} else {
						user = {};
						user.room = getRoomById(message.roomId);
						user.socket = socket;
						user.group_id = 0;
						users.push(user);
						emitRooms();
						if (user.room != undefined && user.room.id >= 0) {
							connection.query('Select `entrance` from `entrances` where group_id=' + user.group_id, function(err, result) {
								var matching = getUsersByRoom(user.room);
								for (var i = matching.length - 1; i >= 0; i--) {
									var match = matching[i];
									var entrance;
									if (result != undefined && result.length > 0) {
										entrance = result[Math.floor(Math.random() * result.length)].entrance;
									}
									match.socket.emit('alert', {
										"alert": "entered",
										'user': user.username,
										"entrance": entrance
									});
								};

							});
						}
					}
				} else {
					socket.emit('alert', {
						'alert': 'danger',
						'text': 'You are not allowed in this room!'
					});
				}
			});

}

});

socket.on('chat', function(message) {
	if (user !== undefined && user.permissions && user.permissions.chat && user.room != undefined && user.username != undefined && message.chat != undefined && message.chat.replace(/^\s+/, '').replace(/\s+$/, '') !== '') {
		var chat = '';
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
		response.kickable = !user.permissions.unkickable;
		var group = getGroupById(user.group_id);
		if (user.attributes != undefined && user.attributes != '' && JSON.parse(user.attributes).color != undefined) {
			response.color = JSON.parse(user.attributes).color;
		} else if (group != undefined && group.attributes != undefined && group.attributes != '' && JSON.parse(group.attributes).color != undefined) {
			response.color = JSON.parse(group.attributes).color;
		}
		response.rank = group.name;
		response.time = new Date();
		chatToRoom(user, response);
	}
});
socket.on('random', function(message) {
	var db = 'words';
	var field = 'word';
	if (message.type == 'funny') {
		db = 'funny';
		field = 'text';
	}
	var count = message.count || 1;
	if (user && user.permissions && user.permissions.words) {
		connectionRead.query("SELECT COUNT(*) FROM " + db, function(err, result) {
			var indexes = [];
			for (var i = 0; i < count; i++) {
				indexes.push(' id=' + (Math.floor(Math.random() * result[0]['COUNT(*)'] + 1)));

			}
			connectionRead.query('SELECT ' + field + ' FROM ' + db + ' WHERE ' + indexes.join(' or '), function(error, results) {
				var words = [];
				for (var j = 0; j < results.length; j++) {
					words.push(results[j][field]);
				}
				chatToRoom(user, {
					chat: words.join(','),
					user: 'SERVER',
					'user_id': -1,
					kickable: false,
					time: new Date()
				});
			});
		});
	}
});
socket.on('sat', function(message) {
	if (user && user.permissions && user.permissions.chat) {
		if (message.type == 'word') {
			connectionRead.query("SELECT COUNT(*) FROM sat_words", function(err, result) {
				var indexes = [];
				indexes.push(' id=' + (Math.floor(Math.random() * result[0]['COUNT(*)'] + 1)));
				connectionRead.query('SELECT word FROM sat_words WHERE ' + indexes.join(' or '), function(error, results) {
					var words = [];
					for (var j = 0; j < results.length; j++) {
						words.push(results[j].word);
					}
					chatToRoom(user, {
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
				if (result && result.length > 0) {
					response = word + " " + result[0].part_of_speech + ". -" + result[0].definition;
				}
				chatToRoom(user, {
					chat: response,
					user: 'SERVER',
					'user_id': -1,
					kickable: false,
					time: new Date()
				});
			});
		} else if (message.type == 'sentence') {
			var response = 'A sentence for this word does not yet exist.';
			chatToRoom(user, {
				chat: response,
				user: 'SERVER',
				'user_id': -1,
				kickable: false,
				time: new Date()
			});
		} else if (message.type == 'question') {
			var numberOfAnswers = 4;
			connectionRead.query("SELECT COUNT(*) FROM sat_questions", function(err, result) {
				var indexes = [];
				indexes.push(' id=' + (Math.floor(Math.random() * result[0]['COUNT(*)'] + 1)));
				connectionRead.query('SELECT question,answer,number_of_answers FROM sat_questions WHERE ' + indexes.join(' or '), function(error, results) {
					var answers = [];
					answers.push(results[0].answer);
					connectionRead.query("SELECT COUNT(*) FROM sat_words", function(err, result1) {
						var indexes = [];
						for (var i = 0; i < numberOfAnswers * results[0].number_of_answers; i++) {
							indexes.push(' id=' + (Math.floor(Math.random() * result1[0]['COUNT(*)'] + 1)));

						}
						connectionRead.query('SELECT word FROM sat_words WHERE ' + indexes.join(' or '), function(error, results1) {

							for (var j = 0; j < results1.length; j += results[0].number_of_answers) {
								var choices = results1.slice(j, j + results[0].number_of_answers);
								var words = [];
								for (var k = 0; k < choices.length; k++) {
									words.push(choices[k].word);
								}
								answers.push(words.join(','));
							}

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
								var shuffled = shuffle(answers);
								var alphabet = ['a','b','c','d','e','f','g'];
								for(var q=0;q<shuffled.length;q++){
									shuffled[q]=alphabet[q]+") "+shuffled[q];
}
var formattedAnswers = shuffled.join('<br>');

chatToRoom(user, {
	chat:results[0].question+"<br>"+formattedAnswers,
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
} else if (message.type == 'help') {
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

socket.on('spanish',function(message){
	var forms = ['yo','tú','el','nosotros','ellos'];
	var form = forms[Math.floor(Math.random()*forms.length)];
	connectionRead.query('SELECT COUNT(*) FROM spanish_verbs',function(err,result){
		var id = Math.floor(Math.random() * result[0]['COUNT(*)'] + 1);
		connectionRead.query('SELECT '+form+',tense,infinitive FROM spanish_verbs WHERE id='+id,function(error,results){
			chatToRoom(user,{
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

var emitSelf = function(emitSocket) {
	var result = {};
	if (user === {}) {
		result = {
			"status": "Not logged in"
		};
		emitSocket.emit('me', result);
	} else {
		result = {
			"status": "Logged in",
			"username": user.username,
			"privates":{}
		};
		result.permissions = user.permissions;
		result.hash = user.hash;
		connection.query('INSERT INTO user_hash SET ?', {
			user_id: user.id,
			hash: user.hash
		}, function(err, result) {});
		
		connection.query("SELECT * FROM private WHERE to_id = " + user.id + ' and receive_delete=0 order by id desc', function(err, results) {
			if(err)
				console.error(err);
			result.privates.receive = results;
			result.unread = 0;
			for (var i = 0; i < results.length; i++) {
                    //count unread messages
                    var message = results[i];
                    if (message.read == 0) {
                    	result.unread++;
                    }
                }
                connection.query("SELECT * FROM private WHERE from_id = " + user.id + ' and send_delete=0 order by id desc',function(err1,result1){
                	result.privates.sent = result1;
                	var ids = [];
                	for(var i=0;i<result.privates.receive.length;i++){
                		ids.push(result.privates.receive[i].from_id);
                	}
                	for(var i=0;i<result.privates.sent.length;i++){
                		ids.push(result.privates.sent[i].to_id);
                	}
                	ids=ids.reduce(function(p, c) {
                		if (p.indexOf(c) < 0) p.push(c);
                		return p;
                	}, []);
                	connection.query('SELECT id,username FROM users WHERE id = '+ids.join(' or '),function(err2,results2){
                		function getUsername(id){
                			for (var i = results2.length - 1; i >= 0; i--) {
                				if(results2[i].id == id)
                					return results2[i].username;
                			};
                			return '';
                		};
                		for(var i=0;i<result.privates.receive.length;i++){
                		var message = result.privates.receive[i];
                		message.username = getUsername(message.from_id);
                	}
                	for(var i=0;i<result.privates.sent.length;i++){
                		var message = result.privates.sent[i];
                		message.username = getUsername(message.to_id);

                	}
                	emitSocket.emit('me', result);
                	});

                	
                });

            });
}


};

socket.on('readMessages', function(message) {
	if (user)
		connection.query('UPDATE private SET ? WHERE to_id = ' + user.id, {
			read: 1
		}, function(err, nothing) {
			emitSelf(socket);
		});
});
socket.on('deletePrivate', function(message) {
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

socket.on('me', function(message) {
	emitSelf(socket);

});

socket.on('addRoom', function(message) {
	if (user != undefined && user.permissions.create) {
		addRoom(message, updateRooms(function() {
			emitRooms();
		}));
	}
});

socket.on('deleteRoom', function(message) {
	var room = getRoomById(message.id);
	if (user != undefined && room != undefined && user.permissions != undefined && user.permissions.delete && (room.requirements.isDeleteable == undefined || room.requirements.isDeleteable || user.permissions.god)) {
		var usersInRoom = getUsersByRoom(room);
		for (var i = usersInRoom.length - 1; i >= 0; i--) {
			usersInRoom[i].socket.emit('alert', {
				"alert": "danger",
				"text": "The Room has been deleted"
			});
			usersInRoom[i].room = undefined;
		};
		deleteRoom(message, updateRooms(function() {
			emitRooms();
		}));
	}
});

socket.on('leave room', function() {
	if (user !== undefined && user.username != undefined && user.room != undefined && user.room.id >= 0) {
		var matching = getUsersByRoom(user.room);
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			match.socket.emit('alert', {
				"alert": "left",
				'user': user.username
			});
		};
		user.room = undefined;
		emitRooms();
	} else if (user !== undefined) {
		user.room = undefined;
		emitRooms();
	}
});
socket.on('startTyping', function() {
	if (user != undefined && user.username != undefined && user.room != undefined && user.room.id >= 0) {
		var matching = getUsersByRoom(user.room);
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			if (match.socket != undefined)
				match.socket.emit('startTyping', {
					'username': user.username
				});
		}
	}
});
socket.on('stopTyping', function(message) {
	if (user != undefined && user.username != undefined && user.room != undefined && user.room.id >= 0) {
		var matching = getUsersByRoom(user.room);
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			if (match.socket != undefined)
				match.socket.emit('stopTyping', {
					'username': user.username
				});
		};
	}
});

socket.on('sendFile', function(message) {
	if (user !== undefined && user.room != undefined && user.username != undefined) {

		var matching = getUsersByRoom(user.room);
			//connection.query('INSERT INTO chat SET ?',{'user_id':user.id,'message':chat,"room_id":user.room.id},function(err,result){if(err != null)console.log(err)});
			var response = {
				"file": message,
				'user': user.username
			};
			var group = getGroupById(user.group_id);
			if (user.attributes != undefined && user.attributes != '' && JSON.parse(user.attributes).color != undefined) {
				response.color = JSON.parse(user.attributes).color;
			} else if (group != undefined && group.attributes != undefined && group.attributes != '' && JSON.parse(group.attributes).color != undefined) {
				response.color = JSON.parse(group.attributes).color;
			}
			for (var i = matching.length - 1; i >= 0; i--) {
				var match = matching[i];
				match.socket.emit('file', response);
			};
		}
	});

socket.on('report', function(message) {
	if (user != undefined && user.id != undefined) {
		message.user_id = user.id;
		if (message.email != undefined && message.email.replace(/^\s+/, '').replace(/\s+$/, '') !== '')
			message.email = user.email;
	}
	connection.query('INSERT INTO reports SET ?', message, function(err, result) {
		if (err != undefined && err != null)
			console.error(err);
		sendEmails();
	});
});

socket.on('kick', function(message) {
	if (user != undefined && user.permissions != undefined && user.permissions.kick) {
		var bannedUser = getUserById(message.user_id);
		if(!bannedUser.permissions.unkickable|| user.permissions.god)
		{
			ban(message.user_id, user.room.id,message.duration);
			
			if (bannedUser != undefined && bannedUser.socket != undefined) {
				bannedUser.socket.emit('alert', {
					'alert': 'danger',
					'text': 'You have been banned from this room for '+(message.duration/(60*1000))+' minutes'
				});
				bannedUser.room = undefined;
			}
		}
		else if(bannedUser.id == user.id){
			user.socket.emit('alert',{'alert':'info',"text":"Did you really just try to ban yourself. What is wrong with you?"})
		}
		else{
			bannedUser.socket.emit('alert',{'alert':"info",'text':user.username+" tried to ban you, just though you would want to know."});
			user.socket.emit('alert',{'alert':"info",'text':'You can\'t ban '+bannedUser.username+", you silly"});
		}

	}
});

socket.on('restart', function(message) {
	if (user != undefined && user.permissions != undefined && user.permissions.restart) {
		io.emit('alert', {
			'alert': 'info',
			"text": "The server is restarting. Please refresh your page."
		});
		setTimeout(function() {
			process.exit()
		}, 100);
	}
})

socket.on('private', function(message) {
	if (user != undefined && user.permissions.chat) {
		if (message.message && message.to_username) {
			getUser(message.to_username, function(to) {
				if (to) {
					var insertVars = {
						to_id: to.id,
						from_id: user.id,
						"message": message.message,
						time: new Date(),
						from_username: user.username
					};
					connection.query('INSERT INTO private SET ?', insertVars, function(err, result) {
						if (err) {
							console.error(err);
						}
					});
					var onlineTo = getUserById(to.id);
					if (onlineTo) {
						emitSelf(onlineTo.socket);
						onlineTo.socket.emit('alert', {
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



var emitRooms = function() {

	updateRooms(function() {
		var tempRooms = [];
		for (var i = rooms.length - 1; i >= 0; i--) {
			var room = rooms[i];
			var roomUsers = getUsersByRoom(room);
			room.guestCount = 0;
			room.userCount = 0;
			room.users = [];
			for (var j = roomUsers.length - 1; j >= 0; j--) {
				var user = roomUsers[j];
				if (user != undefined) {
					if (user.username != undefined) {
						room.users.push(user.username);
						room.userCount++;
					} else {
						room.guestCount++;
					}
				}
			};
				//clone
				var tempRoom = JSON.parse(JSON.stringify(room));
				if (tempRoom.requirements != undefined && tempRoom.requirements.password != undefined)
					delete tempRoom.requirements.password;
				tempRooms.push(tempRoom);

			};
			io.emit('rooms', {
				"rooms": tempRooms
			});
		});
};

emitRooms();
setInterval(emitRooms, 60000);


});


app.post('/reguser', function(req, res) {
	isValidUser(req.body, function(errors) {
		if (errors.length == 0) {
			insertUser(req.body);
			var result = {};
			result.status = 'OK';
			result.redirect = '/index.html';
			req.session.username = req.body.username;
			res.json(result);
		} else {
			var result = {};
			result.status = 'errors';
			result.errors = errors;
			console.log(errors);
			res.json(result);
		}
	});

});

app.post('/me', function(req, res) {
	if (req.session.username == undefined)
		res.json({
			"status": "Not logged in"
		});
	else
		res.json({
			"status": "Logged in"
		});
});

app.post('/login', function(req, res) {
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

app.post('/archive', function(req, res) {
	var body = JSON.parse(req.body.blarg);
	body.order = body.order || {};
	body.order.by = body.order.by || 'id';
	body.order.direction = body.order.direction || 'ASC';
	if (req.session.username) {
		getUser(req.session.username, function(user) {
			if (user && user.permissions && user.permissions.archive) {
				try {
					if (body.type == 'chat') {
						var sql = 'SELECT user_id,room_id,message,time FROM chat ';
						if (body.where.field) {
							sql += 'WHERE ' + body.where.field + ' ' + body.where.equals + ' ';
						}
						sql += 'ORDER BY ' + body.order.by + ' ' + body.order.direction + ' ';
						if (body.range.length != 0) {
							sql += ' LIMIT ' + body.range.start + ',' + body.range.length + ' ';
						}
						connection.query(sql, function(err1, results) {
							if (!results) {
								res.json({
									'success': false,
									'message': 'SQL ERROR/NO RESULTS'
								})
							} else {
								connection.query('SELECT id,username FROM users', function(err2, users) {
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

} else if (body.type == 'users') {
	var sql = 'SELECT id,username,first_name,last_name,email,group_id FROM users ';
	if (body.where.field) {
		sql += 'WHERE ' + body.where.field + '  =  "' + body.where.equals + '" ';
	}
	sql += 'ORDER BY ' + body.order.by + ' ' + body.order.direction + ' ';
	if (body.range.length != 0) {
		sql += ' LIMIT ' + body.range.start + ',' + body.range.length + ' ';
	}
	connection.query(sql, function(err1, results) {
		if (!results) {
			res.json({
				'success': false,
				'message': 'SQL ERROR/NO RESULTS'
			})
		} else {
			connection.query('SELECT id,name FROM groups', function(err2, groups) {
				if (err1 || err2) {
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

app.get('/metrics.json',function(req,res){
	connection.query('SELECT metrics FROM metrics ORDER BY time DESC LIMIT 1',function(err,result){
		res.send(200,result[0].metrics);
	});
});

app.get('/u/:id',function(req,res){
	userData.getUserData(connection,req.params.id,function(data){
		res.render('user',data);
	});
});


app.get('/forgot', function(req, res) {
	res.send(200, '<h1>HAHA that sucks</h1>')
});



var isValidUser = function(data, callback) {
	var errors = [];
	var dataKeys = Object.keys(data);
	var j = dataKeys.length - 1;

	var currentValidation = 0;


	var validate = function(rule, ruleVal, dataKey, value, next) {
		if (rule == 'min') {
			if (value.length < ruleVal)
				errors.push({
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
				errors.push({
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
					errors.push({
						"element": dataKey,
						"text": "Your " + dataKey + " must be unique"
					});
				setTimeout(function() {
					next(errors);
				}, 1);
			});
		} else if (rule == 'matches') {
			if (value !== data[ruleVal])
				errors.push({
					'rule': rule,
					'ruleVal': ruleVal,
					"element": dataKey,
					"text": dataKey + " must be match " + ruleVal + "."
				});
			next(errors);
		} else
		next(errors);
	};
	var runNextValidation = function(errors) {
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
			errors.push({
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

var insertUser = function(userData) {
	var user = {};
	user.username = userData.username;
	user.first_name = userData.firstname;
	user.last_name = userData.lastname;
	user.email = userData.email;
	user.group_id = 1;
	var salt = crypto.randomBytes(128).toString('base64');
	user.password = hash(salt, userData.password)
	user.salt = salt;
	var query = connection.query('INSERT INTO users SET ?', user, function(err, result) {
		console.log(err);
		login(userData.username, userData.password, undefined);
		sendEmails();
	});


};

var addRoom = function(data, callback) {
	var requirements = {};
	requirements.hasPassword = data.hasPassword;
	if (data.hasPassword)
		requirements.password = data.password;
	requirements.isDeleteable = data.isDeleteable;
	if (data.rank !== 'Guest')
		requirements.rank = data.rank;
	var query = connection.query('INSERT INTO rooms SET ?', {
		"name": data.name,
		'requirements': JSON.stringify(requirements)
	}, function(err, result) {
		if (err !== null)
			console.error("At Add room: %s", err);
		if (callback !== null && callback !== undefined)
			callback();
	});
};

var deleteRoom = function(data, callback) {
	connection.query('DELETE FROM rooms WHERE id = ' + data.id, function(err, result) {
		if (err !== null)
			console.error("At delete room: %s", err);
		else
			console.log(result)
		if (callback !== null && callback !== undefined)
			callback();
	});
}

var updateRooms = function(callback) {
	var query = connection.query("SELECT * FROM rooms", function(err, result) {
		if (err !== null)
			console.error("At Update room: %s", err);
		rooms = [];
		for (var i = result.length - 1; i >= 0; i--) {
			result[i].requirements = JSON.parse(result[i].requirements);
			rooms.push(result[i]);
		};
		if (callback !== null && callback !== undefined)
			callback();

	});
}
updateRooms();

var getUser = function(username, callback) {
	var query = connection.query('SELECT * from users where username = "' + username + '"', function(err, result) {
		var user = result[0];
		connection.query('SELECT * from groups where id = ' + user.group_id, function(err, res) {
			if (err != null)
				console.error("At get User group : " + err);
			user.permissions = JSON.parse(res[0].permissions);
			callback(user);
		});

	});
};

var hash = function(salt, raw) {

	return crypto.pbkdf2Sync(raw, salt, config.hash.itterations, config.hash.length).toString('base64');
};

var login = function(username, password, callback) {
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

var guid = function() {
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

var getUserBySocket = function(socket) {
	for (var i = users.length - 1; i >= 0; i--) {
		var user = users[i];
		if (user.socket != undefined && user.socket.id == socket.id)
			return user;
	};
}
var getUserById = function(id) {
	for (var i = users.length - 1; i >= 0; i--) {
		var user = users[i];
		if (user.id != undefined && user.id == id)
			return user;
	};
}

var getRoomById = function(id) {
	for (var i = rooms.length - 1; i >= 0; i--) {
		var room = rooms[i];
		if (room.id == id)
			return room;
	};
}

var getUsersByRoom = function(room) {
	var matching = [];
	for (var i = users.length - 1; i >= 0; i--) {
		var user = users[i];
		if (user.room !== undefined && user.socket != undefined && room !== undefined && user.room.id == room.id)
			matching.push(user);
	};
	return matching;
}

var getWordList=function(){
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
	var handleChatLinks=function(chat){
		var reg_exUrl = new RegExp(/(http|https|ftp|ftps)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?/g);
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
	var sanitize = function(chat,user) {
		chat = validator.escape(chat);
		for(var j =0;j<blacklistRegex.length;j++){
			var regex = blacklistRegex[j];
			var matches = chat.match(regex) || [];
			for (var i = matches.length - 1; i >= 0; i--) {
				var match = matches[i];
				chat = chat.replace(match, "<span class='text-danger'>[CENSORED]</span>");
				connection.query('UPDATE users SET infractions =infractions+1 WHERE id = '+user.id,function(err,result){if(err)console.error(err);});
			};
		}


		return chat;
	}

	var getGroups = function() {
		connection.query('Select * from groups', function(err, result) {
			groups = result;
		});
	};
	getGroups();

	var getGroupById = function(id) {
		for (var i = groups.length - 1; i >= 0; i--) {
			var group = groups[i];
			if (group.id == id)
				return group;
		};
	};
	var ban = function(user, room, duration) {
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

	var isBanned = function(user, room, callback) {
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



	function mail(from, to, message) {
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

	var sendEmails = function() {
		connection.query('SELECT `id`,`name`,`email`,`type`,`report` FROM `chat`.`reports` WHERE informed = 0', function(err, results) {
			for (var i = results.length - 1; i >= 0; i--) {
				var result = results[i];
				var message = 'subject: NOREPLY\r\n\r\n';
				var admin_message = '';
				if (result.type == 'request') {
					message += 'Thank you ' + result.name + " for submitting request\n\n" + result.report + "\n\nWe will be looking into it shortly";
					admin_message = 'subject: NEW REQUEST\r\n\r\n';
					admin_message += result.name + ' submitted request "' + result.report + '"';
					connection.query('UPDATE `chat`.`reports` SET ? WHERE id = ' + result.id, {
						informed: 1
					}, function(err, result) {
						if (err != undefined) console.error(err);
					});
				} else if (result.type == 'bug') {
					message += 'Thank you ' + result.name + " for submitting bug report\n\n" + result.report + "\n\nWe will be looking into it shortly. Your Ticket Id is " + result.id;
					admin_message = 'subject: NEW BUG\r\n\r\n';
					admin_message += result.name + ' submitted bug "' + result.report + '"';
					connection.query('UPDATE `chat`.`reports` SET ? WHERE id = ' + result.id, {
						informed: 1
					}, function(err, result) {
						if (err != undefined) console.error(err);
					});
				}
				mail('gsmstchat@gmail.com', result.email, message);
				connection.query('SELECT `email` FROM `chat`.`users` WHERE group_id=4 or group_id=5', function(error, admins) {
					for (var j = admins.length - 1; j >= 0; j--) {
						var admin = admins[j];
						mail('gsmstchat@gmail.com', admin.email, admin_message);
					};
				});
			};
		});
connection.query('SELECT `id`,`username`,`first_name`,`last_name`,`email` FROM `chat`.`users` WHERE informed = 0', function(err, results) {
	for (var i = results.length - 1; i >= 0; i--) {
		var result = results[i];
		var message = 'subject: NOREPLY\r\n\r\n';

		message += 'Thank you ' + result.first_name + ' ' + result.last_name + " for registering at GSMSTCHAT.com";
		connection.query('UPDATE `chat`.`users` SET ? WHERE id = ' + result.id, {
			informed: 1
		}, function(err, result) {
			if (err != undefined) console.error(err);
		});

		mail('gsmstchat@gmail.com', result.email, message);
	};

});
};

var getUserFromHash = function(hash, callback) {
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

var chatToRoom = function(user, message) {
	connectionChat.query('INSERT INTO chat SET ?', {
		'user_id':message.user_id,
		'message': message.chat,
		"room_id": user.room.id
	}, function(err, result) {
		if (err != null) console.log(err);
	});
	if (user.room.id >= 0) {
		var matching = getUsersByRoom(user.room);
		for (var i = matching.length - 1; i >= 0; i--) {
			var match = matching[i];
			match.socket.emit('chat', message);
		};
	} else {
		user.socket.emit('chat', message);
	}
}

sendEmails();