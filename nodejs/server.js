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
var io = require('socket.io')(server);
var bodyParser = require('body-parser');
var mysql = require('mysql');
var crypto = require('crypto');
var cookieParser = require('cookie-parser');
var session = require('express-session');
var validator = require('validator');






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
app.use(session({secret:'gsmstchat',store:sessionStore}));
var loc = __dirname;
loc = loc.split('\\');
loc.pop(loc.length-1);
loc = loc.join('\\');
if(config.useDirName)
    app.use(express.static(loc));
else
    app.use(express.static("/home/ec2-user/chat"));

//io.use( socketSessions() );

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
        if(user != undefined && user.room == undefined){
            user.room = getRoomById(message.roomId);
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
    });

socket.on('chat',function(message){
    if(user !== undefined &&user.room != undefined && user.username!=undefined){

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
    if(user != undefined && user.permissions.delete){
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



var emitRooms=function(){

    updateRooms(function(){ 
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
        };
        io.emit('rooms',{"rooms":rooms});});
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
    });


};

var addRoom = function(data,callback){
    var query = connection.query('INSERT INTO rooms SET ?',{"name":data.name},function(err,result){
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
        rooms.push(result[i]);
    };
    if(callback!== null && callback!== undefined)
        callback();
    
});
}

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
    var query = connection.query('SELECT `username`,`password`,`salt` from users where username = "'+username+'"',function(err,result){
        if(result.length>0 && result[0].password === hash(result[0].salt,password)){
            if(callback!== undefined)
                callback(true);
        }
        else{
            if(callback!== undefined)
                callback(false);
        }
    });
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

setInterval(function(){
    for (var i = users.length - 1; i >= 0; i--) {
        user = users[i];
        if(user.socket == undefined){
            users.splice(users.indexOf(user),1)
        }
    };
},60000);
