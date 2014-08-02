/**
 * Created by Sonicdeadlock on 8/1/2014.
 */

//set up server
var express = require('express');
var app = express();
var server = require('http').createServer(app);
//var io = require('../..')(server);
var port = 3000;
var bodyParser = require('body-parser');
var fs = require('fs');
var mysql = require('mysql');
var crypto = require('crypto');
var cookieParser = require('cookie-parser')

server.listen(port,function(){
    console.log("Server litening at port %d",port);
});

var config = JSON.parse(fs.readFileSync('nodejs/config.json','utf8'));

var connection = mysql.createConnection(config.mysql);
connection.connect(function(err){console.log(err)});



//routing
var loc = __dirname;
loc = loc.split('\\');
loc.pop(loc.length-1);
loc = loc.join('\\');
app.use(express.static(loc));
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use( bodyParser.urlencoded() ); // to support URL-encoded bodies
//app.use(cookieParser);
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
        res.json({"ststus":"Not logged in"});
});

app.post('/login',function(req,res){

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

var getUser = function(username,callback){
     var query = connection.query('SELECT * from users where username = "'+username+'"',function(err,result){
        callback(results[0]);
    });
};


var hash=function(salt,raw){
    return crypto.pbkdf2Sync(raw, salt, config.hash.itterations, config.hash.length).toString();
};

var login = function(username,password,callback){
    var query = connection.query('SELECT `username`,`password`,`salt` from users where username = "'+username+'"',function(err,result){
        if(result.length>0 && result[0].password === hash(result[0].salt,password)){
            console.log('logged in');
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