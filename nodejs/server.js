/**
 * Created by Sonicdeadlock on 8/1/2014.
 */

//set up server

var fs = require('fs');
var config = JSON.parse(fs.readFileSync('nodejs/config.json','utf8'));
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




var connection = mysql.createConnection(config.mysql);
connection.connect(function(err){console.log(err)});


var rooms=[];
var users=[];
var groups=[];

//routing

app.use(bodyParser.urlencoded({ extended: false }))
app.use(cookieParser());
app.use( bodyParser.json() );
var sessionStore = new session.MemoryStore;
//var sessionStore = new RedisStore();
app.use(session({secret:'gsmstchat',store:sessionStore}));
var loc = __dirname;
loc = loc.split('\\');
loc.pop(loc.length-1);
loc = loc.join('\\');
if(config.useDirName)
    app.use(express.static(loc));
else
    app.use(express.static("/home/ec2-user/chat"));

//io.use( socketSessions({store: sessionStore, key:'sid', secret:'gsmstchat', parser:cookieParser()}));

server.listen(port,function(){
    console.log("Server listening at port %d",port);
});

io.on('connection',function(socket){
    var user;
    socket.on('disconnect',function(){
        if(user!==undefined){
            var matching = getUsersByRoom(user.room);
            for (var i = matching.length - 1; i >= 0; i--) {
                var match = matching[i];
                match.socket.emit('alert',{"alert":"left",'user':user.username})
            };
            user.room=undefined;
            user.socket=undefined;
            emitRooms();
        }
    });

    socket.on('login',function(message){
        login(message.username,message.password,function(success){
            if(success){
                if(user!==undefined){
                    user.socket=undefined;
                }
                getUser(message.username,function(param){
                    user=param;
                    user.socket = socket;
                    users.push(user);
                    var result={"status":"Logged in","username":user.username};
                    result.permissions = user.permissions;
                    socket.emit('me',result)
                });
                
            }
        });
    });

    socket.on('join-room',function(message){
        var canEnterRoom=function(user,room){
            if(user != undefined && user.permissions!=undefined && user.permissions.god)
                return true;
            if(room.requirements){
                if(room.requirements.rank){

                    if(user.permissions==undefined || !(user.permissions[room.requirements.rank]))
                        return false;

                }
                if(room.requirements.hasPassword && message.password!=room.requirements.password){
                    return false;
                }
            }

            return true;

        }


        var room = getRoomById(message.roomId);
        if(room!=undefined){
            if(canEnterRoom(user,room)){
                if(user != undefined && user.room == undefined){
                    user.room = room;
                    emitRooms();
                    connection.query('Select `entrance` from `entrances` where group_id='+user.group_id,function(err,result){
                        var matching = getUsersByRoom(user.room);
                        for (var i = matching.length - 1; i >= 0; i--) {
                         var match = matching[i];
                         var entrance;
                         if(result!= undefined &&result.length > 0) {
                            entrance = result[Math.floor(Math.random() * result.length)].entrance;
                        }
                        match.socket.emit('alert',{"alert":"entered",'user':user.username,"entrance":entrance});
                    };

                });
                }else{
                    user = {};
                    user.room = getRoomById(message.roomId);
                    user.socket = socket;
                    user.group_id=0;
                    users.push(user);
                    emitRooms();
                    connection.query('Select `entrance` from `entrances` where group_id='+user.group_id,function(err,result){
                        var matching = getUsersByRoom(user.room);
                        for (var i = matching.length - 1; i >= 0; i--) {
                         var match = matching[i];
                         var entrance;
                         if(result!= undefined &&result.length > 0) {
                            entrance = result[Math.floor(Math.random() * result.length)].entrance;
                        }
                        match.socket.emit('alert',{"alert":"entered",'user':user.username,"entrance":entrance});
                    };

                });
                }
            }else{
                socket.emit('alert',{'alert':'invalid password'});
            }
        }
        
    });

socket.on('chat',function(message){
    if(user !== undefined &&user.room != undefined && user.username!=undefined && message.chat != undefined && message.chat.replace(/^\s+/, '').replace(/\s+$/, '')!== ''){

        var matching = getUsersByRoom(user.room);
        var chat = sanitize(message.chat);
        connection.query('INSERT INTO chat SET ?',{'user_id':user.id,'message':chat,"room_id":user.room.id},function(err,result){if(err != null)console.log(err)});
        var response = {"chat":chat,'user':user.username};
        var group=getGroupById(user.group_id);
        if(user.attributes != undefined&&user.attributes != '' && JSON.parse(user.attributes).color != undefined){
            response.color = JSON.parse(user.attributes).color;
        }
        else if(group != undefined && group.attributes!=undefined && group.attributes!='' && JSON.parse(group.attributes).color != undefined){
            response.color=JSON.parse(group.attributes).color;
        }
        response.rank=group.name;
        response.time=new Date();
        for (var i = matching.length - 1; i >= 0; i--) {
            var match = matching[i];
            match.socket.emit('chat',response)
        };
    }
});

socket.on('me',function(message){
    var result={};
    if(user==={})
        result = {"status":"Not logged in"};
    else{
        result = {"status":"Logged in","username":user.username};
        result.permissions = user.permissions;
    }

    socket.emit('me',result)
});

socket.on('addRoom',function(message){
    if(user != undefined && user.permissions.create)
    {
        addRoom(message,updateRooms(function(){
         emitRooms();
     }));
    }
});

socket.on('deleteRoom',function(message){
    var room = getRoomById(message.id);
    if(user != undefined && room!=undefined && user.permissons !=undefined && user.permissions.delete && (room.requirements.isDeleteable==undefined || room.requirements.isDeleteable || user.permissions.god)){
        var usersInRoom = getUsersByRoom(room);
        for (var i = usersInRoom.length - 1; i >= 0; i--) {
           usersInRoom[i].socket.emit('alert',{"alert":"danger","text":"The Room has been deleted"});
           usersInRoom[i].room=undefined;
       };
       deleteRoom(message,updateRooms(function(){
         emitRooms();
     }));
   }
});

socket.on('leave room',function(){
    if(user!==undefined && user.username!=undefined){
        var matching = getUsersByRoom(user.room);
        for (var i = matching.length - 1; i >= 0; i--) {
            var match = matching[i];
            match.socket.emit('alert',{"alert":"left",'user':user.username})
        };
        user.room=undefined;
        emitRooms();
    }else if(user!==undefined ){
      user.room=undefined;
      emitRooms();
  }
});
socket.on('startTyping',function(){
    if(user !=undefined && user.username != undefined && user.room != undefined){
        var matching = getUsersByRoom(user.room);
        for (var i = matching.length - 1; i >= 0; i--) {
           var match =  matching[i];
           if(match.socket != undefined)
            match.socket.emit('startTyping',{'username':user.username});
    }
}
});
socket.on('stopTyping',function(message){
    if(user !=undefined && user.username != undefined && user.room != undefined){
        var matching = getUsersByRoom(user.room);
        for (var i = matching.length - 1; i >= 0; i--) {
           var match =  matching[i];
           if(match.socket != undefined)
            match.socket.emit('stopTyping',{'username':user.username});
    };
}
});

socket.on('sendFile',function(message){
    if(user !== undefined &&user.room != undefined && user.username!=undefined){

        var matching = getUsersByRoom(user.room);
        //connection.query('INSERT INTO chat SET ?',{'user_id':user.id,'message':chat,"room_id":user.room.id},function(err,result){if(err != null)console.log(err)});
        var response = {"file":message,'user':user.username};
        var group=getGroupById(user.group_id);
        if(user.attributes != undefined&&user.attributes != '' && JSON.parse(user.attributes).color != undefined){
            response.color = JSON.parse(user.attributes).color;
        }
        else if(group != undefined && group.attributes!=undefined && group.attributes!='' && JSON.parse(group.attributes).color != undefined){
            response.color=JSON.parse(group.attributes).color;
        }
        for (var i = matching.length - 1; i >= 0; i--) {
            var match = matching[i];
            match.socket.emit('file',response);
        };
    }
});

socket.on('report',function(message){
    if(user !=undefined && user.id != undefined){
        message.user_id = user.id;
        if(message.email != undefined &&  message.email.replace(/^\s+/, '').replace(/\s+$/, '')!== '')
            message.email = user.email;
    }
    connection.query('INSERT INTO reports SET ?',message,function(err,result){
        if(err != undefined && err != null)
            console.error(err);
        sendEmails();
    });
});



var emitRooms=function(){

    updateRooms(function(){ 
        var tempRooms=[];
        for (var i = rooms.length - 1; i >= 0; i--) {
            var room = rooms[i];
            var roomUsers =getUsersByRoom(room);
            room.guestCount=0;
            room.userCount=0;
            room.users=[];
            for (var j = roomUsers.length - 1; j >= 0; j--) {
                var user = roomUsers[j];
                if(user!=undefined)
                { 
                    if(user.username!=undefined){
                        room.users.push(user.username);
                        room.userCount++;
                    }
                    else{
                        room.guestCount++;
                    }
                }
            };   
            //clone
            var tempRoom =JSON.parse(JSON.stringify(room));
            if(tempRoom.requirements != undefined && tempRoom.requirements.password != undefined)
                delete tempRoom.requirements.password;
            tempRooms.push(tempRoom);

        };
        io.emit('rooms',{"rooms":tempRooms});});
};

emitRooms();
setInterval(emitRooms,60000);


});


app.post('/reguser',function(req,res){
    isValidUser(req.body,function(errors){
        if(errors.length==0){
            insertUser(req.body);
            var result = {};
            result.status='OK';
            result.redirect='/index.html';
            req.session.username = req.body.username;
            res.json(result);
        }else{
           var result = {};
           result.status='errors';
           result.errors = errors;
           console.log(errors);
           res.json(result);
       }
   });

});

app.post('/me',function(req,res){
    if(req.session.username==undefined)
        res.json({"status":"Not logged in"});
    else
        res.json({"status":"Logged in"});
});

app.post('/login',function(req,res){
    var body = req.body;
    login(body.username,body.password,function(sucessful){
        if(sucessful){
            req.session.username=body.username;
            res.json({"status":"OK"});
        }
        else{
            res.json({"status":"failure"})
        }
    });
});

app.post('/archive',function(req,res){
    var body = JSON.parse(req.body.blarg);
    body.order = body.order || {};
    body.order.by = body.order.by || 'id';
    body.order.direction = body.order.direction || 'ASC';
    if(req.session.username){
        getUser(req.session.username,function(user){
            if(user && user.permissions && user.permissions.archive) {
                try {
                    if (body.type == 'chat') {
                        var sql = 'SELECT user_id,room_id,message,time FROM chat ';
                        if (body.where.field) {
                            sql += 'WHERE ' + body.where.field + ' ' + body.where.equals + ' ';
                        }
                        sql+='ORDER BY '+ body.order.by +' '+body.order.direction +' ';
                        if (body.range.length != 0) {
                            sql += ' LIMIT ' + body.range.start + ',' + body.range.length + ' ';
                        }
                        connection.query(sql, function (err1, results) {
                            if(!results){ res.json({'success': false, 'message': 'SQL ERROR/NO RESULTS'})}
                            else {
                                connection.query('SELECT id,username FROM users', function (err2, users) {
                                    if (err1 || err2) {
                                        res.json({'success': false, 'message': 'SQL ERROR'})
                                    }
                                    else {
                                        var getUser = function (id) {

                                            for (var j = users.length - 1; j >= 0; j--) {
                                                if (users[j].id == id)
                                                    return users[j];
                                            }
                                            ;
                                        }
                                        for (var i = results.length - 1; i >= 0; i--) {
                                            var result = results[i];
                                            var user = getUser(result.user_id);
                                            var room = getRoomById(result.room_id);
                                            result.username = user.username || '*REMOVED*';
                                            result['room_name*'] = room ? room.name : '*DELETED*';
                                        }
                                        ;
                                        res.json({success: true, info: results});
                                    }
                                });
                            }
                         });

                    } else if (body.type == 'users') {
                        var sql = 'SELECT id,username,first_name,last_name,email,group_id FROM users ';
                        if (body.where.field) {
                            sql += 'WHERE ' + body.where.field + '  =  "' + body.where.equals + '" ';
                        }
                        sql+='ORDER BY ' +body.order.by +' '+body.order.direction +' ';
                        if (body.range.length != 0) {
                            sql += ' LIMIT ' + body.range.start + ',' + body.range.length + ' ';
                        }
                        connection.query(sql, function (err1, results) {
                             if(!results){ res.json({'success': false, 'message': 'SQL ERROR/NO RESULTS'})}
                            else {
                                 connection.query('SELECT id,name FROM groups', function (err2, groups) {
                                     if (err1 || err2) {
                                         res.json({'success': false, 'message': 'SQL ERROR'})
                                     }
                                     else {
                                         var getGroup = function (id) {

                                             for (var j = groups.length - 1; j >= 0; j--) {
                                                 if (groups[j].id == id)
                                                     return groups[j];
                                             }
                                             ;
                                         }
                                         for (var i = results.length - 1; i >= 0; i--) {
                                             var result = results[i];
                                             var group = getGroup(result.group_id);
                                             result['group_name*'] = group ? group.name : '*DELETED*';
                                         }
                                         ;
                                         res.json({success: true, info: results});
                                     }
                                 });
                             }
                        });
                    }
                }catch(error) {
                    res.json({'success':false,'message':'SQL ERROR'})
                }
            }
            else{
                res.json({'success':false,'message':'INVALID PERMISSIONS'});
            }
        });
    }
    else{
        res.json({'success':false,'message':'LOGIN'});
    }
});

app.post('/addRoom',function(req,res){
    var body = req.body;
    if(true)//has permission
    {
        addRoom(body,updateRooms(function(){

        }));
    }
});

app.post('/rooms',function(req,res){
    res.json(rooms);
});

app.get('/forgot',function(req,res){
    res.send(200,'<h1>HAHA that sucks</h1>')
});



var isValidUser=function(data,callback){
    var errors = [];
    var dataKeys = Object.keys(data);
    var j = dataKeys.length-1;

    var currentValidation = 0;

    
    var validate=function(rule,ruleVal,dataKey,value,next){
        if(rule == 'min'){
            if (value.length < ruleVal)
                errors.push({'rule': rule, 'ruleVal': ruleVal, "element": dataKey, "text": dataKey + " must be " + ruleVal + " or more characters"});
            setTimeout(function(){next(errors);},1);
        }

        else if(rule == 'max'){
            if (value.length >= ruleVal)
                errors.push({'rule': rule, 'ruleVal': ruleVal, "element": dataKey, "text": dataKey + " must be less than " + ruleVal + " characters"});
            setTimeout(function(){next(errors);},1);
        }

        else if(rule == 'unique'){
            connection.query("SELECT `id` from "+ruleVal.table+" where "+ruleVal.column+" = '"+value+"'",function(err,result){
                console.log(err);
                if(result !== undefined && result.length>1)
                   errors.push({"element": dataKey, "text": "Your "+dataKey+" must be unique"});
               setTimeout(function(){next(errors);},1);
           });
        }
        else if(rule== 'matches'){
            if(value !== data[ruleVal])
                errors.push({'rule': rule, 'ruleVal': ruleVal, "element": dataKey, "text": dataKey + " must be match " + ruleVal + "."});
            next(errors);
        }
        else
            next(errors);
    };
    var runNextValidation= function(errors){
      var dataKey = dataKeys[j];
      var value = data[dataKey];

      var rules = Object.keys(config.register_validataions[dataKey]);
      var rule = rules[currentValidation];

      var ruleVal = config.register_validataions[dataKey][rule];
      currentValidation++;

      if(j==0 && currentValidation == rules.length)
        validate(rule,ruleVal,dataKey,value,callback);
    else {
     if(currentValidation  >= rules.length)
     {
       j--;
       currentValidation=0;
   }
   validate(rule,ruleVal,dataKey,value,runNextValidation);

}
};
var rules = Object.keys(config.register_validataions);
for (var i = rules.length - 1; i >= 0; i--) {
  var ruleKey = rules[i];
  var datavalue = data[ruleKey];
  if(config.register_validataions[ruleKey].required == true && (datavalue === undefined || datavalue.trim() ==='' )) {
      errors.push({"element": ruleKey, "rule": "required", "text": ruleKey + " is required"});
      delete data[ruleKey];
  }
};
dataKeys = Object.keys(data);
if(dataKeys !== undefined && dataKeys.length>0)
    runNextValidation(null);
else
    callback(errors);


};

var insertUser = function(userData){
    var user={};
    user.username = userData.username;
    user.first_name =  userData.firstname;
    user.last_name = userData.lastname;
    user.email = userData.email;
    user.group_id = 1;
    var salt = crypto.randomBytes(128).toString('base64');
    user.password = hash(salt,userData.password)
    user.salt = salt;
    var query = connection.query('INSERT INTO users SET ?', user, function(err, result) {
        console.log(err);
        login(userData.username,userData.password,undefined);
        sendEmails();
    });


};

var addRoom = function(data,callback){
    var requirements = {};
    requirements.hasPassword = data.hasPassword;
    if(data.hasPassword)
        requirements.password = data.password;
    requirements.isDeleteable = data.isDeleteable;
    if(data.rank !== 'Guest')
        requirements.rank=data.rank;
    var query = connection.query('INSERT INTO rooms SET ?',{"name":data.name,'requirements':JSON.stringify(requirements)},function(err,result){
        if(err !== null)
            console.error("At Add room: %s",err);
        if(callback!== null && callback!== undefined)
            callback();
    });
};

var deleteRoom = function(data,callback){
    connection.query('DELETE FROM rooms WHERE id = '+data.id,function(err,result){
       if(err !== null)
        console.error("At Add room: %s",err);
    if(callback!== null && callback!== undefined)
        callback();
});
}

var updateRooms = function(callback){
    var query = connection.query("SELECT * FROM rooms",function(err,result){
     if(err !== null)
        console.error("At Update room: %s",err);
    rooms=[];
    for (var i = result.length - 1; i >= 0; i--) {
        result[i].requirements = JSON.parse(result[i].requirements);
        rooms.push(result[i]);
    };
    if(callback!== null && callback!== undefined)
        callback();
    
});
}
updateRooms();

var getUser = function(username,callback){
   var query = connection.query('SELECT * from users where username = "'+username+'"',function(err,result){
    var user =result[0];
    connection.query('SELECT * from groups where id = '+user.group_id,function(err,res){
        if(err != null)
            console.error("At get User group : "+err);
        user.permissions = JSON.parse(res[0].permissions);
        callback(user);
    }); 
    
});
};

var hash=function(salt,raw){

    return crypto.pbkdf2Sync(raw, salt, config.hash.itterations, config.hash.length).toString('base64');
};

var login = function(username,password,callback){
    if(password!='' && password!=undefined) {
        var query = connection.query('SELECT `username`,`password`,`salt` from users where username = "' + username + '"', function (err, result) {
            if (result.length > 0 && result[0].password === hash(result[0].salt, password)) {
                if (callback !== undefined)
                    callback(true);
            }
            else {
                if (callback !== undefined)
                    callback(false);
            }
        });
    }
    else{
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

var getUserBySocket = function(socket){
    for (var i = users.length - 1; i >= 0; i--) {
        var user = users[i];
        if(user.socket!=undefined && user.socket.id==socket.id)
            return user;
    };
}

var getRoomById = function(id){
    for (var i = rooms.length - 1; i >= 0; i--) {
        var room = rooms[i];
        if(room.id == id)
            return room;
    };
}

var getUsersByRoom = function(room){
    var matching = [];
    for (var i = users.length - 1; i >= 0; i--) {
        var user = users[i];
        if(user.room !== undefined && user.socket!=undefined && room !== undefined &&user.room.id==room.id)
            matching.push(user);
    };
    return matching;
}

var sanitize = function(chat){
    chat = validator.escape(chat);
    var reg_exUrl = new RegExp(/(http|https|ftp|ftps)\:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,3}(\/\S*)?/g);
    var matches = chat.match(reg_exUrl) || [];
    for (var i = matches.length - 1; i >= 0; i--) {
        var match = matches[i];
        var image_regex = new RegExp(/(png|jpg|jpeg|gif)$/g);
        if(match.match(image_regex))
            chat = chat.replace(match,"<img src='"+match+"'></img>");
        else
           chat = chat.replace(match,"<a target='_blank' href='"+match+"'>"+match+"</a>");
   };
   return chat;
}

var getGroups = function(){
    connection.query('Select * from groups',function(err,result){groups=result;});
};
getGroups();

var getGroupById=function(id){
    for (var i = groups.length - 1; i >= 0; i--) {
       var group= groups[i];
       if(group.id==id)
        return group;
};
};
var ban=function(user,room,duration){
    var insertVars = {user_id:user,room_id:room,duration:duration,time:new Date()};
    connection.query("INSERT INTO kicks SET ?",insertVars,function(err,result){
        if(err!=null)
            console.error(err);
    });
}


setInterval(function(){
    for (var i = users.length - 1; i >= 0; i--) {
        user = users[i];
        if(user.socket == undefined){
            users.splice(users.indexOf(user),1)
        }
    };
    getGroups();
},60000);



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

var sendEmails = function(){
    connection.query('SELECT `id`,`name`,`email`,`type`,`report` FROM `chat`.`reports` WHERE informed = 0',function(err,results){
        for (var i = results.length - 1; i >= 0; i--) {
            var result = results[i];
            var message = 'subject: NOREPLY\r\n\r\n';
            var admin_message = '';
            if(result.type=='request'){
                message += 'Thank you '+ result.name + " for submitting request\n\n" +  result.report +"\n\nWe will be looking into it shortly";
                admin_message = 'subject: NEW REQUEST\r\n\r\n';
                admin_message+=result.name+' submitted request "' + result.report+'"';
                connection.query('UPDATE `chat`.`reports` SET ? WHERE id = '+result.id,{informed:1},function(err,result){if(err!=undefined)console.error(err);});
            }
            else if(result.type=='bug'){
               message += 'Thank you '+ result.name + " for submitting bug report\n\n" +  result.report +"\n\nWe will be looking into it shortly. Your Ticket Id is "+result.id;
               admin_message = 'subject: NEW BUG\r\n\r\n';
               admin_message+=result.name+' submitted bug "' + result.report+'"';
               connection.query('UPDATE `chat`.`reports` SET ? WHERE id = '+result.id,{informed:1},function(err,result){if(err!=undefined)console.error(err);});
           }
           mail('gsmstchat@gmail.com',result.email,message);
           connection.query('SELECT `email` FROM `chat`.`users` WHERE group_id=4 or group_id=5',function(error,admins){
            for (var j = admins.length - 1; j >= 0; j--) {
                var admin = admins[j];
                     mail('gsmstchat@gmail.com',admin.email,admin_message);
              };
          });
       };
   });
connection.query('SELECT `id`,`username`,`first_name`,`last_name`,`email` FROM `chat`.`users` WHERE informed = 0',function(err,results){
    for (var i = results.length - 1; i >= 0; i--) {
        var result = results[i];
        var message = 'subject: NOREPLY\r\n\r\n';

        message += 'Thank you '+ result.first_name + ' '+ result.last_name + " for registering at GSMSTCHAT.com";
        connection.query('UPDATE `chat`.`users` SET ? WHERE id = '+result.id,{informed:1},function(err,result){if(err!=undefined)console.error(err);});

        mail('gsmstchat@gmail.com',result.email,message);
    };
});
};

sendEmails();